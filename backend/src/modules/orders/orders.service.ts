import { Injectable, OnModuleInit, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository, In, Between } from 'typeorm';
import { randomBytes } from 'crypto';
import * as Sentry from '@sentry/node';
import { Order, OrderStatus, StoneStatus, SupplySource, Factory } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { Sku } from '../../database/entities/sku.entity';
import { Company } from '../../database/entities/company.entity';
import { CustomerCode } from '../../database/entities/customer-code.entity';
import { EmailService } from '../email/email.service';
import { OrderFilterDto } from './dto/order-filter.dto';
import { SkuService } from '../sku/sku.service';
import { STANDING_FACTORY_RECIPIENTS } from './factory-notification-recipients';
import { buildFactoryOrderPdf } from './factory-order-pdf.util';

export { OrderFilterDto };

const CAD_STATUSES = [OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS];

// Caps for buildFactoryOrderPdfAttachment: an unresponsive file host must
// degrade the factory-assigned email (fewer/no attachments) rather than
// block it forever — the per-file cap bounds one slow fetch, the overall cap
// bounds the whole step in case there are many files.
const CAD_FILE_FETCH_TIMEOUT_MS = 15_000;
const FACTORY_ATTACHMENT_BUILD_TIMEOUT_MS = 45_000;
const TIMED_OUT = Symbol('TIMED_OUT');

// Races a promise against a hard deadline. The loser keeps running in the
// background — nothing here cancels it — but the caller stops waiting for
// it, which is what actually matters for an un-awaited, fire-and-forget
// notification chain that must never hang indefinitely.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return Promise.race([
    promise,
    new Promise<typeof TIMED_OUT>(resolve => setTimeout(() => resolve(TIMED_OUT), ms)),
  ]);
}

// Product spec fields — editable via PUT /orders/:id, Admin/Authorizer only
const EDITABLE_SPEC_KEYS = ['metalType', 'metalColor', 'size', 'quantity', 'stamping', 'diamondType', 'diamondQuality', 'centerStoneShape', 'approximateCaratWeight'];

// Customer detail fields — editable via PUT /orders/:id, Admin only
const EDITABLE_CUSTOMER_KEYS = ['storeName', 'customerFullName', 'customerEmail', 'phoneNumber'];

// Admin-only fields editable via PUT /orders/:id outside the status-change flow
const ADMIN_ONLY_KEYS = ['supplySource', 'assignedFactory', 'quoteOptions', 'isPriorityCustomer'];

// Human-readable labels for the CSV export — mirrors STATUS_CONFIG/
// SUPPLY_SOURCE_CONFIG/FACTORY_CONFIG in frontend/src/utils/types.ts, since
// the export should read the way the order detail page reads.
const CSV_STATUS_LABELS: Record<string, string> = {
  NEW: 'New', CAD_IN_PROGRESS: 'CAD In Progress', VPO_ISSUED: 'VPO Issued', MANUFACTURED: 'Manufactured',
  SHIPPED: 'Shipped', REPAIR: 'Repair', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const CSV_SUPPLY_SOURCE_LABELS: Record<string, string> = {
  STONE_CREATIONS: 'Creations', KIRA: 'Kira', KIRA_JEWELS_USA: 'Kira Jewels Usa',
};
const CSV_FACTORY_LABELS: Record<string, string> = {
  KAMA_JEWELRY: 'Kama Jewelry', CREATIONS: 'Creations', UNIQUE_DESIGNS: 'Unique Designs', JEWEL_ONE: 'Jewel One',
};

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Every diamondType option before "Natural" was added was some flavor of
// lab-grown (e.g. "Certified Lab Grown Diamond", "Lab grown") — so treating
// anything NOT explicitly containing "natural" as lab-grown is a safe
// default across old and new orders alike, not just a guess.
function isNaturalDiamond(diamondType: string | null | undefined): boolean {
  return /natural/i.test(diamondType || '');
}

// Single-line human-readable spec summary for the "For RightClick" SKU
// export's interchange_description column — every populated spec field,
// comma-joined, in the same order they'd read on the order detail page.
function buildOrderSpecDescription(o: Order): string {
  const parts = [
    o.metalType && o.metalColor ? `${o.metalType} ${o.metalColor}` : (o.metalType || o.metalColor),
    o.orderType,
    o.size ? `Size ${o.size}` : null,
    o.centerStoneShape,
    o.approximateCaratWeight ? `${o.approximateCaratWeight}ct` : null,
    o.diamondType,
    o.diamondQuality,
    o.stamping,
  ];
  return parts.filter(Boolean).join(', ');
}

// Shared column set for every order CSV export (Admin/Authorizer VPO export,
// the Factory Manager's own-orders export, and the daily factory digest).
// `factoryVisible: false` marks the fields FactoryRedactionInterceptor also
// hides everywhere else (pricing, customer identity) plus the reference
// link — the closest thing to a "reference image" on this row. CAD files and
// the conversation thread are never in here since they live in separate
// tables never joined into this query.
function buildOrderCsvColumns(restrictForFactory: boolean): { header: string; value: (o: Order) => string }[] {
  return ([
    { header: 'PO Number', value: (o: Order) => o.poNumber || '' },
    { header: 'Customer PO#', value: (o: Order) => o.refCustomerPo || '' },
    { header: 'Kira SKU', value: (o: Order) => o.kiraSkuNumber || '' },
    { header: 'Order Type', value: (o: Order) => o.orderType || '' },
    { header: 'Manufacturing Path', value: (o: Order) => o.manufacturingPath || '' },
    { header: 'Stone Supplier', value: (o: Order) => CSV_SUPPLY_SOURCE_LABELS[o.supplySource || ''] || o.supplySource || '' },
    { header: 'Factory', value: (o: Order) => CSV_FACTORY_LABELS[o.assignedFactory || ''] || o.assignedFactory || '' },
    { header: 'Reference Link', value: (o: Order) => o.referenceWeblink || '', factoryVisible: false },
    { header: 'Store Name', value: (o: Order) => o.storeName || '', factoryVisible: false },
    { header: 'Customer Name', value: (o: Order) => o.customerFullName || '', factoryVisible: false },
    { header: 'Customer Email', value: (o: Order) => o.customerEmail || '', factoryVisible: false },
    { header: 'Phone', value: (o: Order) => o.phoneNumber || '', factoryVisible: false },
    { header: 'Metal Type', value: (o: Order) => o.metalType || '' },
    { header: 'Metal Color', value: (o: Order) => o.metalColor || '' },
    { header: 'Size', value: (o: Order) => o.size || '' },
    { header: 'Quantity', value: (o: Order) => String(o.quantity ?? '') },
    { header: 'Stamping', value: (o: Order) => o.stamping || '' },
    { header: 'Diamond Type', value: (o: Order) => o.diamondType || '' },
    { header: 'Diamond Quality', value: (o: Order) => o.diamondQuality || '' },
    { header: 'Stone Shape', value: (o: Order) => o.centerStoneShape || '' },
    { header: 'Carat Weight', value: (o: Order) => o.approximateCaratWeight || '' },
    { header: 'Customer Notes', value: (o: Order) => o.customerNotes || '' },
    { header: 'Current Status', value: (o: Order) => CSV_STATUS_LABELS[o.status] || o.status },
    { header: 'Priority', value: (o: Order) => o.isPriorityCustomer ? 'Priority' : 'Regular' },
    { header: 'Stone Status', value: (o: Order) => o.stoneStatus === StoneStatus.STONE_RECEIVED ? 'Stone Received' : o.stoneStatus === StoneStatus.PENDING_STONE ? 'Pending Stone' : '' },
    { header: 'Quoted Price', value: (o: Order) => o.quotedCost != null ? String(o.quotedCost) : '', factoryVisible: false },
    { header: 'Quote Options', value: (o: Order) => (o.quoteOptions || []).map(q => `${q.label}: $${q.price}`).join('; '), factoryVisible: false },
    { header: 'Committed Ship Date', value: (o: Order) => o.committedShipDate || '' },
    { header: 'Created By', value: (o: Order) => o.salesRepName || o.salesRepEmail || '' },
    { header: 'Created Date', value: (o: Order) => o.createdAt ? o.createdAt.toISOString() : '' },
    { header: 'Updated Date', value: (o: Order) => o.updatedAt ? o.updatedAt.toISOString() : '' },
    { header: 'VPO Issued Date', value: (o: Order) => o.vpoIssuedAt ? new Date(o.vpoIssuedAt).toISOString() : '' },
  ] as { header: string; value: (o: Order) => string; factoryVisible?: boolean }[])
    .filter(c => !restrictForFactory || c.factoryVisible !== false);
}

// MM/DD/YYYY — the date format the ERP's "New Order" import expects for
// interchange_date/interchange_ship_date.
function formatDateMDY(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function ordersToCsv(orders: Order[], columns: { header: string; value: (o: Order) => string }[]): string {
  const lines = [
    columns.map(c => csvEscape(c.header)).join(','),
    ...orders.map(o => columns.map(c => csvEscape(c.value(o))).join(',')),
  ];
  return lines.join('\n');
}

// Bounds of `at`'s calendar day in the given IANA time zone, as actual UTC
// instants — used to pick out "assigned today" by New York wall-clock time
// regardless of what time zone the server itself runs in.
function zonedDayBoundsUtc(timeZone: string, at: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(at).reduce((acc: Record<string, string>, p) => { acc[p.type] = p.value; return acc; }, {});
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const zonedAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}.000Z`);
  const offsetMs = zonedAsUtc.getTime() - at.getTime();
  const dayStartZonedAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
  const start = new Date(dayStartZonedAsUtc.getTime() - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

// Fields worth diffing into the audit log when changed via PUT /orders/:id —
// price, spec, customer details, and the committed ship date. Human-readable
// labels used in the logged note.
const TRACKED_FIELD_LABELS: Record<string, string> = {
  quotedCost: 'Price',
  customerCode: 'Customer number',
  committedShipDate: 'Ship date',
  metalType: 'Metal type',
  metalColor: 'Metal color',
  size: 'Size',
  quantity: 'Quantity',
  stamping: 'Stamping',
  diamondType: 'Diamond type',
  diamondQuality: 'Diamond quality',
  centerStoneShape: 'Center stone shape',
  approximateCaratWeight: 'Carat weight',
  storeName: 'Store name',
  customerFullName: 'Customer name',
  customerEmail: 'Customer email',
  phoneNumber: 'Phone number',
};

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NEW]:             [OrderStatus.CAD_IN_PROGRESS],
  [OrderStatus.CAD_IN_PROGRESS]: [OrderStatus.VPO_ISSUED],
  [OrderStatus.VPO_ISSUED]:      [OrderStatus.MANUFACTURED, OrderStatus.CAD_IN_PROGRESS],
  [OrderStatus.MANUFACTURED]:    [OrderStatus.COMPLETED, OrderStatus.REPAIR, OrderStatus.VPO_ISSUED],
  [OrderStatus.REPAIR]:          [OrderStatus.COMPLETED],
  [OrderStatus.SHIPPED]:         [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]:       [],
  [OrderStatus.CANCELLED]:       [],
};

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(CadFile)      private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(OrderEvent)   private readonly eventRepo: Repository<OrderEvent>,
    @InjectRepository(OrderMessage) private readonly messageRepo: Repository<OrderMessage>,
    @InjectRepository(Sku)          private readonly skuRepo: Repository<Sku>,
    @InjectRepository(Company)      private readonly companyRepo: Repository<Company>,
    @InjectRepository(CustomerCode) private readonly customerCodeRepo: Repository<CustomerCode>,
    private readonly emailService: EmailService,
    private readonly skuService: SkuService,
  ) {}

  // One-time startup fix: TypeORM's synchronize didn't drop the old DB-level
  // DEFAULT 'KIRA' on supplySource when that default was removed from the
  // entity, so every order created since then was silently getting
  // supplySource='KIRA' at INSERT time even though nothing ever assigned it.
  // Idempotent — safe to run on every boot; a no-op once the default is gone
  // and no bogus rows remain.
  async onModuleInit() {
    try {
      await this.orderRepo.query(`ALTER TABLE orders ALTER COLUMN "supplySource" DROP DEFAULT`);
      const result = await this.orderRepo.query(
        `UPDATE orders SET "supplySource" = NULL WHERE "assignedFactory" IS NULL AND "supplySource" IS NOT NULL`,
      );
      const affected = Array.isArray(result) ? result[1] : result?.affectedRows;
      if (affected) this.logger.warn(`Startup cleanup: cleared bogus supplySource default on ${affected} order(s)`);
    } catch (err) {
      this.logger.error('Startup supplySource cleanup failed:', (err as Error)?.message);
    }
  }

  private logEvent(
    orderId: string,
    action: string,
    user?: { id?: string; email: string },
    fromStatus?: string,
    toStatus?: string,
    note?: string,
  ) {
    const ev = this.eventRepo.create({
      orderId,
      userId: user?.id,
      userEmail: user?.email || 'system',
      action,
      fromStatus,
      toStatus,
      note,
    });
    this.eventRepo.save(ev).catch(() => {});
  }

  // Compares incoming dto values against the current order for every tracked
  // field and returns a list of "Label: old → new" strings for whichever
  // actually changed. undefined dto values mean "not part of this edit" and
  // are skipped; null/'' are treated as real values so clearing a field logs too.
  private diffTrackedFields(order: Order, dto: Partial<Order>): string[] {
    const changes: string[] = [];
    for (const [key, label] of Object.entries(TRACKED_FIELD_LABELS)) {
      const next = (dto as any)[key];
      if (next === undefined) continue;
      const prev = (order as any)[key];
      const prevStr = prev === null || prev === undefined ? '' : String(prev);
      const nextStr = next === null ? '' : String(next);
      if (prevStr !== nextStr) {
        changes.push(`${label}: ${prevStr || '—'} → ${nextStr || '—'}`);
      }
    }
    return changes;
  }

  async getEvents(orderId: string): Promise<OrderEvent[]> {
    return this.eventRepo.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  // Permanently deletes an order and every row that hangs off its orderId.
  // No FK cascade exists at the DB level, so child tables are cleared explicitly.
  async remove(id: string, user?: { email: string }): Promise<{ deleted: true; poNumber: string }> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    await this.cadRepo.delete({ orderId: id });
    await this.skuRepo.delete({ orderId: id });
    await this.notifRepo.delete({ orderId: id });
    await this.messageRepo.delete({ orderId: id });
    await this.eventRepo.delete({ orderId: id });
    await this.orderRepo.delete(id);

    this.logger.warn(`Order ${order.poNumber} (${id}) permanently deleted by ${user?.email || 'unknown'}`);
    return { deleted: true, poNumber: order.poNumber };
  }

  // Send in-app notifications + optional Resend email to authorizers and CAD designers on revision
  private async notifyRevision(order: Order): Promise<void> {
    const targets = await this.userRepo.find({
      where: { role: In([UserRole.AUTHORIZER, UserRole.CAD_DESIGNER]) },
    });

    const title = `CAD Revision Required — ${order.poNumber}`;
    const message = `Customer rejected the CAD design for order ${order.poNumber} (${order.storeName || order.customerFullName || ''}). The order has been moved to Revision stage. Please review and upload a revised design.`;

    // In-app notifications
    await Promise.all(
      targets.map(u =>
        this.notifRepo.save(
          this.notifRepo.create({
            type: NotificationType.CAD_REJECTED,
            title,
            message,
            orderId: order.id,
            targetUserId: u.id,
            isPriority: order.isPriorityCustomer,
          }),
        ),
      ),
    );

    // Email only CAD Designers — Authorizer shouldn't get any CAD-related email.
    const emails = targets.filter(u => u.role === UserRole.CAD_DESIGNER).map(u => u.email).filter(Boolean);
    if (emails.length) {
      this.emailService.sendCadRevisionAlert({
        to: emails,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || '—',
        orderType: order.orderType || '—',
        orderId: order.id,
        isPriorityCustomer: order.isPriorityCustomer,
      }).catch(err => this.logger.warn('CAD revision email failed:', err));
    }
  }

  // Sidebar nav badges — Admin/Authorizer only, so these are deliberately
  // unscoped (no per-user/factory/supply-source narrowing needed, since that
  // view already sees everything). "Stone" counts NULL alongside PENDING_STONE
  // as still-pending, matching every other pending-stone check in this file —
  // ManufacturingService.getMetrics()'s pendingStone omits the NULL case, which
  // is an existing inconsistency there, not something replicated here.
  async getNavCounts(): Promise<{ orders: number; cadFiles: number; manufacturing: number; stone: number; repairs: number }> {
    const [orders, cadFiles, manufacturing, stone, repairs] = await Promise.all([
      this.orderRepo.count(),
      this.orderRepo.createQueryBuilder('o')
        .where('o.status = :s', { s: OrderStatus.CAD_IN_PROGRESS })
        .andWhere('(o.cadSubStatus IS NULL OR o.cadSubStatus = :r)', { r: 'REVISION' })
        .getCount(),
      this.orderRepo.count({ where: { status: OrderStatus.VPO_ISSUED } }),
      this.orderRepo.createQueryBuilder('o')
        .where('o.status = :s', { s: OrderStatus.VPO_ISSUED })
        .andWhere('(o.stoneStatus IS NULL OR o.stoneStatus = :p)', { p: StoneStatus.PENDING_STONE })
        .getCount(),
      this.orderRepo.count({ where: { status: OrderStatus.REPAIR } }),
    ]);
    return { orders, cadFiles, manufacturing, stone, repairs };
  }

  // Admin/Authorizer dashboard report — Mon-Fri of the week containing
  // `weekStart` (defaults to the current week). "Approved" and "Cancelled"
  // are read off order_events rather than the order's current status, since
  // an order's status can move on past VPO_ISSUED/CANCELLED by the time this
  // report runs — the event log is what actually happened *that day*.
  async getWeeklyActivityReport(weekStart?: string): Promise<{ date: string; dayLabel: string; received: number; approved: number; manufactured: number; cancelled: number }[]> {
    const base = weekStart ? new Date(`${weekStart}T00:00:00`) : new Date();
    const dow = base.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(base);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + mondayOffset);

    const days = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });

    return Promise.all(days.map(async day => {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const [received, approved, manufactured, cancelled] = await Promise.all([
        this.orderRepo.count({ where: { createdAt: Between(day, dayEnd) } }),
        this.eventRepo.count({ where: { action: 'STATUS_CHANGE', toStatus: OrderStatus.VPO_ISSUED, createdAt: Between(day, dayEnd) } }),
        this.eventRepo.count({ where: { action: 'STATUS_CHANGE', toStatus: OrderStatus.MANUFACTURED, createdAt: Between(day, dayEnd) } }),
        this.eventRepo.count({ where: { action: 'STATUS_CHANGE', toStatus: OrderStatus.CANCELLED, createdAt: Between(day, dayEnd) } }),
      ]);
      return {
        date: day.toISOString().slice(0, 10),
        dayLabel: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        received, approved, manufactured, cancelled,
      };
    }));
  }

  // Top 5 customers for the given calendar month (defaults to current month),
  // ranked by order count or total quoted amount. These can be two genuinely
  // different sets of 5 (a customer with few but expensive orders can outrank
  // a high-volume one by amount) — sortBy re-runs the query, it doesn't just
  // reorder one fixed result set.
  async getTopCustomersReport(month?: string, sortBy: 'count' | 'amount' = 'count'): Promise<{ name: string; orderCount: number; amount: number }[]> {
    const [year, mon] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0, 23, 59, 59, 999);

    const rows = await this.orderRepo.createQueryBuilder('o')
      .select(`COALESCE(NULLIF(o.storeName, ''), NULLIF(o.customerFullName, ''), 'Unknown')`, 'name')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(o.quotedCost), 0)', 'amount')
      .where('o.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy(`COALESCE(NULLIF(o.storeName, ''), NULLIF(o.customerFullName, ''), 'Unknown')`)
      .orderBy(sortBy === 'amount' ? 'amount' : '"orderCount"', 'DESC')
      .limit(5)
      .getRawMany();

    return rows.map(r => ({ name: r.name, orderCount: parseInt(r.orderCount, 10), amount: parseFloat(r.amount) }));
  }

  // Top 5 sales reps by total order count across their customers, for the
  // given calendar month (defaults to current month). Mirrors the exact
  // ownership rule findAll() uses for a Sales Rep's own order list (own
  // salesRepId stamp, OR any order under a company whose *current*
  // salesRepId is them) — a plain GROUP BY on order.salesRepId would
  // undercount reps whose customers' companies were reassigned since those
  // orders were placed.
  async getTopSalesRepsReport(month?: string): Promise<{ repName: string; customerCount: number; orderCount: number }[]> {
    const [year, mon] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0, 23, 59, 59, 999);

    const reps = await this.userRepo.find({ where: { role: UserRole.SALES_REP } });
    const results = await Promise.all(reps.map(async rep => {
      const row = await this.orderRepo.createQueryBuilder('o')
        .select('COUNT(*)', 'orderCount')
        .addSelect(`COUNT(DISTINCT COALESCE(o.companyId, o.customerEmail, o.storeName))`, 'customerCount')
        .where(
          '(o.salesRepId = :repId OR (o.companyId IS NOT NULL AND o.companyId IN (SELECT c.id::text FROM companies c WHERE c."salesRepId" = :repId)))',
          { repId: rep.id },
        )
        .andWhere('o.createdAt BETWEEN :start AND :end', { start, end })
        .getRawOne();
      return {
        repName: `${rep.firstName} ${rep.lastName}`.trim(),
        orderCount: parseInt(row?.orderCount, 10) || 0,
        customerCount: parseInt(row?.customerCount, 10) || 0,
      };
    }));

    return results.filter(r => r.orderCount > 0).sort((a, b) => b.orderCount - a.orderCount).slice(0, 5);
  }

  async findAll(filters: OrderFilterDto, user?: { id: string; email: string; role: string; companyId?: string | null; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null }) {
    const qb = this.orderRepo.createQueryBuilder('order');

    if (user?.role === 'CUSTOMER') {
      // Companies share order visibility — a teammate sees every order placed
      // by anyone at their company, not just their own.
      qb.andWhere(
        '(order.customerEmail = :email OR order.customerId = :uid OR (order.companyId IS NOT NULL AND order.companyId = :companyId))',
        { email: user.email, uid: user.id, companyId: user.companyId ?? null },
      );
    } else if (user?.role === 'SALES_REP') {
      // Falls back to company membership, not just the order's own salesRepId
      // stamp — that field is denormalized at creation time, so an order
      // whose customer was later merged into (or reassigned within) this
      // rep's company shouldn't disappear from their queue.
      qb.andWhere(
        // companyId is stored as varchar, not uuid — cast c.id or Postgres
        // rejects the IN() comparison outright ("operator does not exist:
        // character varying = uuid").
        '(order.salesRepId = :salesRepId OR (order.companyId IS NOT NULL AND order.companyId IN (SELECT c.id::text FROM companies c WHERE c."salesRepId" = :salesRepId)))',
        { salesRepId: user.id },
      );
    } else if (user?.role === 'CAD_DESIGNER') {
      qb.andWhere('order.status IN (:...cadStatuses)', { cadStatuses: CAD_STATUSES });
    } else if (user?.role === 'FACTORY_MANAGER') {
      // Invisible until Admin/Authorizer assigns this order to this user's factory.
      qb.andWhere('order.status IN (:...factoryStatuses)', {
        factoryStatuses: [OrderStatus.VPO_ISSUED, OrderStatus.MANUFACTURED],
      });
      qb.andWhere('order.assignedFactory = :assignedFactory', { assignedFactory: user.assignedFactory ?? null });
    } else if (user?.role === 'STONE_MANAGER') {
      // Invisible until Admin/Authorizer assigns this order to this user's supply source.
      qb.andWhere('order.status = :vpoStatus', { vpoStatus: OrderStatus.VPO_ISSUED });
      qb.andWhere('(order.stoneStatus = :pendingStone OR order.stoneStatus IS NULL)', { pendingStone: 'PENDING_STONE' });
      qb.andWhere('order.supplySource = :assignedSupplySource', { assignedSupplySource: user.assignedSupplySource ?? null });
    }

    if (filters.status) qb.andWhere('order.status = :status', { status: filters.status });

    // CAD sub-filters (applied server-side so pagination is accurate)
    if (filters.cadSubFilter === 'cad_pending')
      qb.andWhere('(order.cadSubStatus IS NULL OR order.cadSubStatus = :csPending)', { csPending: 'PENDING' });
    else if (filters.cadSubFilter === 'cad_awaiting_quote')
      qb.andWhere('(order.cadSubStatus = :csUploaded AND order.sentToCustomer = :notSent)', { csUploaded: 'UPLOADED', notSent: false });
    else if (filters.cadSubFilter === 'cad_awaiting_approval')
      qb.andWhere('(order.cadSubStatus = :csUploaded2 AND order.sentToCustomer = :sent)', { csUploaded2: 'UPLOADED', sent: true });
    else if (filters.cadSubFilter === 'cad_revision')
      qb.andWhere('order.cadSubStatus = :csRevision', { csRevision: 'REVISION' });
    else if (filters.cadSubFilter === 'cad_approved')
      qb.andWhere('order.cadSubStatus = :csApproved', { csApproved: 'APPROVED' });

    // Stone sub-filters
    if (filters.stoneSubFilter === 'stone_unassigned')
      qb.andWhere('(order.assignedFactory IS NULL OR order.supplySource IS NULL)');
    else if (filters.stoneSubFilter === 'stone_pending')
      qb.andWhere('order.assignedFactory IS NOT NULL AND order.supplySource IS NOT NULL')
        .andWhere('(order.stoneStatus IS NULL OR order.stoneStatus = :spPending)', { spPending: 'PENDING_STONE' });
    else if (filters.stoneSubFilter === 'stone_received')
      qb.andWhere('order.stoneStatus = :spReceived', { spReceived: 'STONE_RECEIVED' });

    if (filters.assignedFactory) qb.andWhere('order.assignedFactory = :assignedFactory', { assignedFactory: filters.assignedFactory });
    if (filters.supplySource) qb.andWhere('order.supplySource = :filterSupplySource', { filterSupplySource: filters.supplySource });

    // "Customer texted" — orders with an UNREAD customer chat message: the
    // customer has posted at least one, and no staff member has opened the
    // conversation since. Team-wide, not per-viewer — once ANY staff member
    // reads it (order_conversation_reads.lastReadAt, the same table "Seen by"
    // reads from), it drops out of this filter for everyone, not just for
    // whoever read it.
    if (filters.hasCustomerMessage === 'true') {
      // order_messages.orderId / order_conversation_reads.orderId are varchar
      // while orders.id is uuid — same mismatch as order.companyId vs
      // companies.id above, needs an explicit cast or Postgres rejects the
      // comparison outright. Casting both sides to text (not just the uuid
      // side) so this doesn't assume the exact column type, which has drifted
      // between environments before on this project.
      // order.id::text (cast glued directly onto the column) defeats
      // TypeORM's reserved-word alias quoting for "order", sending the bare
      // keyword straight to Postgres and causing a syntax error. Parenthesizing
      // the column keeps a terminator right after it so TypeORM still quotes it.
      qb.andWhere(`
        EXISTS (SELECT 1 FROM order_messages om WHERE om."orderId"::text = (order.id)::text AND om."authorRole" = 'CUSTOMER')
        AND NOT EXISTS (
          SELECT 1 FROM order_conversation_reads ocr
          WHERE ocr."orderId"::text = (order.id)::text
            AND ocr."lastReadAt" >= (
              SELECT MAX(om2."createdAt") FROM order_messages om2
              WHERE om2."orderId"::text = (order.id)::text AND om2."authorRole" = 'CUSTOMER'
            )
        )
      `);
    }

    if (filters.search) {
      const escaped = filters.search.replace(/[%_\\]/g, c => `\\${c}`);
      qb.andWhere(
        '(order.poNumber ILIKE :s OR order.storeName ILIKE :s OR order.kiraSkuNumber ILIKE :s OR order.customerFullName ILIKE :s OR order.customerEmail ILIKE :s OR order.vendorName ILIKE :s OR order.refCustomerPo ILIKE :s)',
        { s: `%${escaped}%` },
      );
    }
    if (filters.dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: new Date(filters.dateFrom) });
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      qb.andWhere('order.createdAt <= :dateTo', { dateTo: to });
    }
    qb.orderBy('order.isPriorityCustomer', 'DESC')
      .addOrderBy('order.createdAt', filters.sortOrder === 'asc' ? 'ASC' : 'DESC')
      .skip(filters.offset || 0)
      .take(filters.limit || 50);
    const [orders, total] = await qb.getManyAndCount();
    return { orders, total };
  }

  // Admin/Authorizer export of the VPO Issued list — mirrors what's on the
  // order detail page (product specs, customer info, pricing, assignment,
  // timeline) but never reference images, CAD design files, or the
  // conversation thread, since those live in separate tables entirely and
  // aren't part of the Order row this reads from. The date filter applies to
  // vpoIssuedAt, not createdAt — this list is about when an order was
  // approved into production, not when it was first placed.
  //
  // A Factory Manager can also hit this — scoped to their own assignedFactory
  // (same visibility rule as findAll()) and stripped of the same fields
  // FactoryRedactionInterceptor hides everywhere else (pricing, customer
  // identity), plus the reference link, since that's the closest thing to a
  // "reference image" this row has.
  async exportVpoIssuedCsv(dateFrom?: string, dateTo?: string, user?: { role: string; assignedFactory?: Factory | null }, orderIds?: string[]): Promise<string> {
    const isFactory = user?.role === UserRole.FACTORY_MANAGER;

    const where: any = { status: OrderStatus.VPO_ISSUED };
    if (isFactory) where.assignedFactory = user?.assignedFactory ?? null;
    if (orderIds?.length) {
      // An explicit selection overrides the date range — the caller picked
      // exactly which orders they want, regardless of when the VPO was issued.
      where.id = In(orderIds);
    } else if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date('1970-01-01');
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : new Date();
      where.vpoIssuedAt = Between(from, to);
    }
    const orders = await this.orderRepo.find({ where, order: { vpoIssuedAt: 'DESC' } });
    return ordersToCsv(orders, buildOrderCsvColumns(isFactory));
  }

  // "For RightClick" — one row per selected order, in the shape our ERP's
  // "New SKU" import expects. companycode/inventorylocationcode branch on
  // whether the order's diamond is natural or lab-grown; vendor_no is looked
  // up per assigned factory.
  private static readonly FACTORY_VENDOR_CODES: Record<Factory, string> = {
    [Factory.CREATIONS]:      'V00252',
    [Factory.KAMA_JEWELRY]:   'V16206',
    [Factory.UNIQUE_DESIGNS]: 'V00057',
    [Factory.JEWEL_ONE]:      'V00064',
  };

  async exportOrderSkuCsv(orderIds: string[]): Promise<string> {
    const orders = orderIds.length
      ? await this.orderRepo.find({ where: { id: In(orderIds) } })
      : [];

    const columns: { header: string; value: (o: Order) => string }[] = [
      {
        header: 'interchange_companycode',
        value: o => isNaturalDiamond(o.diamondType) ? 'KJI-N' : 'KJI-J',
      },
      {
        header: 'interchange_inventorylocationcode',
        value: o => isNaturalDiamond(o.diamondType) ? 'CUS-NAT' : 'CUS',
      },
      { header: 'interchange_code', value: o => o.kiraSkuNumber || '' },
      { header: 'interchange_description', value: o => buildOrderSpecDescription(o) },
      {
        header: 'interchange_vendor_no',
        value: o => (o.assignedFactory && OrdersService.FACTORY_VENDOR_CODES[o.assignedFactory]) || '',
      },
    ];

    return ordersToCsv(orders, columns);
  }

  // "RightClick Orders" — one row per selected order, in the shape the ERP's
  // "New Order" import template expects. Fields marked "by default same
  // always" in that template are hardcoded; interchange_date/ship_date are
  // both just today's date (the file's own download date); interchange_line_no
  // is always "1" since each order maps to a single SKU/line.
  async exportRightClickOrdersCsv(orderIds: string[]): Promise<string> {
    const orders = orderIds.length
      ? await this.orderRepo.find({ where: { id: In(orderIds) } })
      : [];

    const todayMDY = formatDateMDY(new Date());

    const columns: { header: string; value: (o: Order) => string }[] = [
      { header: 'interchange_customer_no', value: o => o.customerCode || '' },
      { header: 'interchange_po', value: o => o.poNumber || '' },
      { header: 'interchange_reference', value: () => '' },
      { header: 'interchange_order_type', value: () => 'Asset' },
      { header: 'interchange_date', value: () => todayMDY },
      { header: 'interchange_ship_date', value: () => todayMDY },
      { header: 'interchange_shipviacode', value: () => 'PICKUP' },
      { header: 'interchange_order_notes', value: o => buildOrderSpecDescription(o) },
      { header: 'interchange_line_no', value: () => '1' },
      { header: 'interchange_item', value: o => o.kiraSkuNumber || '' },
      { header: 'interchange_item_quantity', value: o => String(o.quantity ?? '') },
      { header: 'interchange_item_price', value: o => o.quotedCost != null ? String(o.quotedCost) : '' },
      { header: 'interchange_item_discountpercent', value: () => '' },
      { header: 'interchange_item_notes', value: () => '' },
      { header: 'interchange_item_createpo', value: () => 'TRUE' },
    ];

    return ordersToCsv(orders, columns);
  }

  // Runs every day at 8:00 PM America/New_York — sends each factory (any
  // Factory enum value with at least one order assigned to it "today", by NY
  // wall-clock) a CSV of just those orders, to the same recipients who get
  // the "order assigned to your factory" alert in assignSupplier() (tagged
  // FACTORY_MANAGER users + STANDING_FACTORY_RECIPIENTS). "Assigned today" is
  // read off the SUPPLIER_ASSIGNED order_event, not vpoIssuedAt — an order
  // can sit VPO_ISSUED unassigned for days before someone runs
  // assignSupplier, so vpoIssuedAt alone would misattribute the digest date.
  @Cron('0 20 * * *', { timeZone: 'America/New_York' })
  async sendScheduledDailyFactoryDigest(): Promise<void> {
    await this.sendDailyFactoryDigest(new Date());
  }

  async sendDailyFactoryDigest(at: Date): Promise<void> {
    const { start, end } = zonedDayBoundsUtc('America/New_York', at);
    const assignedEvents = await this.eventRepo.find({
      where: { action: 'SUPPLIER_ASSIGNED', createdAt: Between(start, end) },
    });
    if (!assignedEvents.length) return;

    const orderIds = Array.from(new Set(assignedEvents.map(e => e.orderId)));
    const orders = await this.orderRepo.find({ where: { id: In(orderIds) }, order: { poNumber: 'ASC' } });

    const ordersByFactory = new Map<Factory, Order[]>();
    for (const o of orders) {
      if (!o.assignedFactory) continue;
      if (!ordersByFactory.has(o.assignedFactory)) ordersByFactory.set(o.assignedFactory, []);
      ordersByFactory.get(o.assignedFactory)!.push(o);
    }

    const dateLabel = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
    const columns = buildOrderCsvColumns(true);

    for (const [factory, factoryOrders] of ordersByFactory) {
      const factoryUsers = await this.userRepo.find({ where: { assignedFactory: factory } });
      const recipients = Array.from(new Set([
        ...factoryUsers.map(u => u.email).filter(Boolean),
        ...(STANDING_FACTORY_RECIPIENTS[factory] || []),
      ]));
      if (!recipients.length) {
        const msg = `Daily factory digest for "${factory}" has ${factoryOrders.length} order(s) but no email recipients configured (no tagged FACTORY_MANAGER, no STANDING_FACTORY_RECIPIENTS entry).`;
        this.logger.error(msg);
        Sentry.captureMessage(msg, 'error');
        continue;
      }

      const csv = ordersToCsv(factoryOrders, columns);
      const factoryLabel = CSV_FACTORY_LABELS[factory] || factory;
      await this.emailService.send({
        to: recipients,
        subject: `${factoryLabel} — Orders Assigned Today (${dateLabel})`,
        html: `<p style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1A2740">${factoryOrders.length} order${factoryOrders.length === 1 ? '' : 's'} assigned to ${factoryLabel} today (${dateLabel}) — attached as CSV.</p>`,
        attachments: [{ filename: `${factory.toLowerCase().replace(/_/g, '-')}-orders-${dateLabel}.csv`, content: Buffer.from(csv, 'utf-8') }],
      }).catch(err => {
        this.logger.warn(`Daily factory digest email failed for "${factory}":`, err);
        Sentry.captureException(err);
      });
    }
  }

  async findOne(id: string, user?: { id?: string; email: string; role: string; companyId?: string | null; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null }): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    if (user?.role === 'CUSTOMER'
        && order.customerEmail !== user.email
        && order.customerId !== user.id
        && !(user.companyId && order.companyId === user.companyId)) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (user?.role === 'SALES_REP' && user.id && order.salesRepId !== user.id) {
      // Same company-membership fallback as findAll() — order.salesRepId is
      // a denormalized stamp, so also allow via a teammate whose salesRepId
      // (kept in sync per company) matches this rep.
      const viaCompany = order.companyId
        ? await this.userRepo.findOne({ where: { companyId: order.companyId, salesRepId: user.id } })
        : null;
      if (!viaCompany) {
        throw new NotFoundException(`Order ${id} not found`);
      }
    }

    // Invisible until Admin/Authorizer assigns this order to this user's factory.
    if (user?.role === 'FACTORY_MANAGER' && (
      (order.status !== OrderStatus.VPO_ISSUED && order.status !== OrderStatus.MANUFACTURED) ||
      !order.assignedFactory || order.assignedFactory !== user.assignedFactory
    )) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    // Invisible until Admin/Authorizer assigns this order to this user's supply source.
    if (user?.role === 'STONE_MANAGER' && (
      !order.supplySource || order.supplySource !== user.assignedSupplySource
    )) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }

  // Reuses findOne()'s per-role visibility checks (it throws NotFoundException
  // for anything the user shouldn't see) instead of re-deriving the rules —
  // used by the chat gateway to gate room joins to orders the socket's user
  // can actually access.
  async canUserAccessOrder(id: string, user?: { id?: string; email: string; role: string; companyId?: string | null; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null }): Promise<boolean> {
    try {
      await this.findOne(id, user);
      return true;
    } catch {
      return false;
    }
  }

  // Order IDs this user is allowed to see, or null if their role has no extra
  // restriction (Admin/Authorizer see everything) — same scoping as findAll()'s
  // role branch above, factored out for reuse by global message search.
  async getVisibleOrderIds(user?: { id: string; email: string; role: string; companyId?: string | null; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null }): Promise<string[] | null> {
    if (!user) return null;
    const qb = this.orderRepo.createQueryBuilder('order').select('order.id', 'id');

    if (user.role === 'CUSTOMER') {
      qb.andWhere(
        '(order.customerEmail = :email OR order.customerId = :uid OR (order.companyId IS NOT NULL AND order.companyId = :companyId))',
        { email: user.email, uid: user.id, companyId: user.companyId ?? null },
      );
    } else if (user.role === 'SALES_REP') {
      qb.andWhere(
        '(order.salesRepId = :salesRepId OR (order.companyId IS NOT NULL AND order.companyId IN (SELECT c.id::text FROM companies c WHERE c."salesRepId" = :salesRepId)))',
        { salesRepId: user.id },
      );
    } else if (user.role === 'CAD_DESIGNER') {
      qb.andWhere('order.status IN (:...cadStatuses)', { cadStatuses: CAD_STATUSES });
    } else if (user.role === 'FACTORY_MANAGER') {
      qb.andWhere('order.status IN (:...factoryStatuses)', { factoryStatuses: [OrderStatus.VPO_ISSUED, OrderStatus.MANUFACTURED] });
      qb.andWhere('order.assignedFactory = :assignedFactory', { assignedFactory: user.assignedFactory ?? null });
    } else if (user.role === 'STONE_MANAGER') {
      qb.andWhere('order.status = :vpoStatus', { vpoStatus: OrderStatus.VPO_ISSUED });
      qb.andWhere('(order.stoneStatus = :pendingStone OR order.stoneStatus IS NULL)', { pendingStone: 'PENDING_STONE' });
      qb.andWhere('order.supplySource = :assignedSupplySource', { assignedSupplySource: user.assignedSupplySource ?? null });
    } else {
      return null; // ADMIN, AUTHORIZER, and any other unlisted role: unrestricted
    }

    const rows = await qb.getRawMany();
    return rows.map(r => r.id);
  }

  // New style: "C00001", "C00002", ... Legacy "CO#####" orders (and the
  // embedded "KJ-2026-XXXX (CO#####)" format) are a separate, frozen
  // sequence — this only continues the highest existing "C#####" number.
  // Public so other order-creation entry points (e.g. the public web-form
  // intake) share the same sequence instead of keeping their own.
  async generatePoNumber(): Promise<string> {
    const [{ maxSeq }]: { maxSeq: number | null }[] = await this.orderRepo.query(
      `SELECT MAX(CAST(SUBSTRING("poNumber" FROM 2) AS INTEGER)) AS "maxSeq" FROM orders WHERE "poNumber" ~ '^C[0-9]+$'`,
    );
    return `C${String((maxSeq ?? 0) + 1).padStart(5, '0')}`;
  }

  async create(dto: Partial<Order>, user?: { id: string; email: string; firstName?: string; lastName?: string; role: string; [key: string]: any }): Promise<Order> {
    if (!dto.diamondType) {
      throw new BadRequestException('Diamond Type is required.');
    }
    const data: Partial<Order> = { ...dto };

    // Always auto-generate PO number and tracking token — ignore any client-supplied values
    data.poNumber      = await this.generatePoNumber();
    data.trackingToken = randomBytes(32).toString('hex');

    // Store creator's full name from the JWT
    if (user) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      if (fullName) data.salesRepName = fullName;
    }

    if (user?.role === 'CUSTOMER') {
      data.customerId = user.id;
      data.customerEmail = user.email;
      if (!data.customerFullName) {
        data.customerFullName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || user.email;
      }
    } else if (user?.role === 'SALES_REP') {
      data.salesRepId = user.id;
      data.salesRepEmail = user.email;
    }
    // Linking to an existing customer (via the picker) is encouraged — it's
    // what gives company-wide order sharing and Sales Rep attribution — but
    // not required: any staff role with order-creation access can place an
    // order from the typed contact fields alone, same as Admin already could.
    //
    // If nothing was linked but the typed email matches an existing
    // customer account anyway, resolve it regardless — otherwise an order
    // placed "for" a real customer by staff who just didn't use the picker
    // stays invisible in that customer's own portal.
    if (!data.customerId && data.customerEmail) {
      const matched = await this.userRepo.createQueryBuilder('u')
        .where('LOWER(u.email) = LOWER(:email)', { email: data.customerEmail })
        .andWhere('u.role = :role', { role: UserRole.CUSTOMER })
        .getOne();
      if (matched) data.customerId = matched.id;
    }

    // Mark order with customer's priority status, and — if no sales rep is
    // already attributed (i.e. the customer placed this order themselves,
    // not their rep) — inherit the sales rep assigned to that customer
    // account, so the order shows up in that rep's view even though they
    // didn't personally create it.
    if (data.customerId) {
      const customer = await this.userRepo.findOne({ where: { id: data.customerId } });
      if (customer?.isPriority) data.isPriorityCustomer = true;
      if (!data.salesRepId && customer?.salesRepId) data.salesRepId = customer.salesRepId;
      // So every teammate at the same company can see this order, not just
      // whoever personally placed it. Self-heals a Company row for legacy
      // accounts that predate the companies feature — same fallback
      // getCompanyTeammates() already does — so this guarantee doesn't
      // depend on someone happening to have opened "Team" for them first.
      if (customer && !customer.companyId) {
        const name = customer.storeName?.trim() || `${customer.firstName} ${customer.lastName}`.trim() || customer.email;
        const company = await this.companyRepo.save(this.companyRepo.create({ name, salesRepId: customer.salesRepId || null }));
        await this.userRepo.update(customer.id, { companyId: company.id });
        customer.companyId = company.id;
      }
      data.companyId = customer?.companyId ?? null;
    }

    // New orders start in NEW status — auth/admin reviews and moves to CAD_IN_PROGRESS
    if (!data.status) data.status = OrderStatus.NEW;

    const order = this.orderRepo.create(data);
    const saved = await this.orderRepo.save(order);

    // Email customer: order received (with magic tracking link)
    const customerEmail = saved.customerEmail || (user?.role === 'CUSTOMER' ? user.email : null);
    if (customerEmail) {
      this.emailService.sendOrderPlaced({
        to:             customerEmail,
        poNumber:       saved.poNumber,
        customerName:   saved.customerFullName || saved.storeName || 'Valued Customer',
        orderType:      saved.orderType || '—',
        orderId:        saved.id,
        trackingToken:  saved.trackingToken,
      }).catch(err => this.logger.warn('Order placed email failed:', err));
    }

    // Notify authorizers: new order received — they review before assigning CAD.
    // Admins only get notified when tagged in the order's conversation.
    const authTeam = await this.userRepo.find({ where: { role: In([UserRole.AUTHORIZER]) } });
    const authEmails = authTeam.map(u => u.email).filter(Boolean);
    await Promise.all(authTeam.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type: NotificationType.ORDER_CREATED,
        title: `New Order Received — ${saved.poNumber}`,
        message: `A new order ${saved.poNumber} has been placed and is awaiting your review.`,
        orderId: saved.id,
        targetUserId: u.id,
        isPriority: saved.isPriorityCustomer,
      })),
    ));
    if (authEmails.length) {
      this.emailService.sendNewOrderToAuthorizers({
        to: authEmails,
        poNumber: saved.poNumber,
        customerName: saved.customerFullName || saved.storeName || 'Valued Customer',
        orderType: saved.orderType || '—',
        storeName: saved.storeName || '',
        orderId: saved.id,
        isPriorityCustomer: saved.isPriorityCustomer,
      }).catch(err => this.logger.warn('New order authorizer email failed:', err));
    }

    return saved;
  }

  async update(id: string, dto: Partial<Order>, user?: { id?: string; email: string; role: string }): Promise<Order> {
    const order = await this.findOne(id, user);
    if (dto.committedShipDate !== undefined
        && user?.role !== UserRole.ADMIN && user?.role !== UserRole.AUTHORIZER) {
      throw new ForbiddenException('Only Admin or Authorizer can set the committed ship date.');
    }
    if (EDITABLE_SPEC_KEYS.some(k => (dto as any)[k] !== undefined)
        && user?.role !== UserRole.ADMIN && user?.role !== UserRole.AUTHORIZER) {
      throw new ForbiddenException('Only Admin or Authorizer can edit product specs.');
    }
    if (EDITABLE_CUSTOMER_KEYS.some(k => (dto as any)[k] !== undefined) && user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only Admin can edit customer details.');
    }
    // dto.status !== undefined means this write is part of a status transition (e.g. VPO issuance
    // sets supplySource alongside status) — that path is gated by the status endpoint's own role check,
    // not this one, which only guards standalone edits via PUT /orders/:id.
    if (ADMIN_ONLY_KEYS.some(k => (dto as any)[k] !== undefined) && dto.status === undefined && user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only Admin can edit this field.');
    }

    // Saving a quoted price requires a RightClick customer number to already be
    // set on the order, or to be provided alongside this save.
    if (dto.quotedCost !== undefined && Number(dto.quotedCost) > 0
        && !(dto.customerCode !== undefined ? dto.customerCode : order.customerCode)) {
      throw new BadRequestException('Select a customer number before saving a quote.');
    }
    if (dto.customerCode !== undefined && dto.customerCode !== order.customerCode) {
      if (dto.customerCode) {
        const match = await this.customerCodeRepo.findOne({ where: { code: dto.customerCode } });
        if (!match) throw new BadRequestException('Unrecognized customer number.');
        dto.customerCodeName = match.name;
      } else {
        dto.customerCodeName = null as any;
      }
    }

    // Diff price/spec/customer/ship-date fields before they're overwritten, so the
    // audit log captures *what* changed on this edit, not just that an edit happened.
    const changes = this.diffTrackedFields(order, dto);

    Object.assign(order, dto);
    const saved = await this.orderRepo.save(order);

    if (changes.length) {
      this.logEvent(id, 'ORDER_UPDATED', user, undefined, undefined, changes.join('\n'));
    }

    // When quoted price is saved on CAD_IN_PROGRESS order (not yet sent/approved) → auto-send to customer
    if (dto.quotedCost && Number(dto.quotedCost) > 0
        && saved.status === OrderStatus.CAD_IN_PROGRESS
        && saved.customerEmailApproval !== true
        && !saved.sentToCustomer) {
      const allCads = await this.cadRepo.find({ where: { orderId: id } });
      const uploadedDesignFiles = allCads.filter(
        c => c.designerNotes !== 'Reference image' && c.designerNotes !== 'Customer reference image'
          && (c.status === CadFileStatus.UPLOADED || c.status === CadFileStatus.SENT_FOR_APPROVAL),
      );
      if (uploadedDesignFiles.length > 0) {
        await this.orderRepo.update(id, { sentToCustomer: true, lastApprovalEmailAt: new Date() });
        // Only UPLOADED ones need a status bump; SENT_FOR_APPROVAL already correct
        const toBumpIds = uploadedDesignFiles.filter(c => c.status === CadFileStatus.UPLOADED).map(c => c.id);
        if (toBumpIds.length) {
          await this.cadRepo.update({ id: In(toBumpIds) }, { status: CadFileStatus.SENT_FOR_APPROVAL });
        }
        if (saved.customerEmail) {
          this.emailService.sendCadReadyForApproval({
            to:            saved.customerEmail,
            poNumber:      saved.poNumber,
            customerName:  saved.customerFullName || saved.storeName || 'Valued Customer',
            orderType:     saved.orderType || '—',
            orderId:       saved.id,
            trackingToken: saved.trackingToken,
          }).catch(err => this.logger.warn('CAD ready for approval email failed:', err));
        }
      }
    }

    return saved;
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    user?: { id?: string; email: string; role: string },
    quotedCost?: number,
    repairContractor?: string,
    customerCode?: string,
  ): Promise<Order> {
    if (user?.role === 'CUSTOMER') {
      throw new ForbiddenException('Not authorized to change order status directly');
    }

    // Manual cancellation by admin/authorizer → deactivate (allowed from any active status)
    if (status === OrderStatus.CANCELLED) {
      const beforeCancel = await this.findOne(id);
      const cancelled = await this.update(id, { status: OrderStatus.CANCELLED, isArchived: true }, user);
      // Recorded so reactivateOrder() below knows what to restore — this
      // transition previously wasn't logged at all, unlike every other one.
      this.logEvent(id, 'STATUS_CHANGE', user, beforeCancel.status, OrderStatus.CANCELLED);
      return cancelled;
    }

    // ── Status transition guard — prevent stage-skipping ─────────────────
    const existing = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${status}. ` +
        `Allowed next steps: ${allowed?.length ? allowed.join(', ') : 'none (order is in a terminal state)'}`,
      );
    }

    // Admin-only revert: undo an accidental "Manufactured" mark, back to VPO Issued.
    // Skips the approve-order side effects below (no new SKU/price/notifications) —
    // the order was already approved and assigned, this just corrects the stage.
    if (existing.status === OrderStatus.MANUFACTURED && status === OrderStatus.VPO_ISSUED) {
      if (user?.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only Admin can revert a manufactured order back to VPO Issued.');
      }
      const reverted = await this.update(id, { status, processedDate: null as any, vpoIssuedAt: new Date() }, user);
      this.logEvent(id, 'STATUS_CHANGE', user, existing.status, status, 'Reverted from Manufactured by Admin');
      return reverted;
    }

    // Admin-only revert: send an approved order back into CAD for rework (e.g.
    // VPO issued by mistake, or the customer wants further changes before
    // production starts). Resets the CAD-approval flags so it behaves like a
    // normal CAD_IN_PROGRESS order again; the existing SKU/quoted price are
    // left alone since re-approval will reuse or replace them.
    if (existing.status === OrderStatus.VPO_ISSUED && status === OrderStatus.CAD_IN_PROGRESS) {
      if (user?.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only Admin can revert a VPO-issued order back to CAD In Progress.');
      }
      const reverted = await this.update(id, {
        status, cadSubStatus: null, sentToCustomer: false, customerEmailApproval: false, vpoIssuedAt: null,
      }, user);
      this.logEvent(id, 'STATUS_CHANGE', user, existing.status, status, 'Reverted from VPO Issued by Admin');
      return reverted;
    }

    // Approve the order: require quoted price, auto-generate the SKU, and issue the
    // VPO. Supplier/factory are NOT chosen here — the order stays invisible to every
    // Factory/Stone Manager until Admin/Authorizer completes the separate
    // "Assign Supplier" step (see assignSupplier() below).
    if (status === OrderStatus.VPO_ISSUED) {
      const order = await this.findOne(id);
      const finalPrice = quotedCost ?? order.quotedCost;
      if (!finalPrice || Number(finalPrice) <= 0) {
        throw new BadRequestException('Approximate quoted price is required before issuing the VPO.');
      }
      const finalCustomerCode = customerCode ?? order.customerCode;
      if (!finalCustomerCode) {
        throw new BadRequestException('Select a customer number before issuing the VPO.');
      }
      if (!order.kiraSkuNumber) {
        await this.skuService.generate(id, user?.email);
      }
      // This is also how staff approve the CAD "on behalf of the customer" via
      // the Move to Stage shortcut — a separate path from the dedicated CAD
      // approve endpoint (CadService.approve()). Without this, the order
      // advances to VPO_ISSUED while its CAD file(s) stay SENT_FOR_APPROVAL
      // forever, which the order detail page renders as a permanently stuck
      // "Awaiting Approval" badge even though the order has already moved on.
      await this.cadRepo.update(
        { orderId: id, status: CadFileStatus.SENT_FOR_APPROVAL },
        { status: CadFileStatus.APPROVED, approvedAt: new Date(), approvedBy: user?.email },
      );
      const vpoOrder = await this.update(id, { status, quotedCost: finalPrice, customerCode, vpoIssuedAt: new Date() }, user);
      this.logEvent(id, 'STATUS_CHANGE', user, existing.status, status);

      // Email customer: design approved, in production
      if (vpoOrder.customerEmail) {
        this.emailService.sendOrderInProduction({
          to: vpoOrder.customerEmail,
          poNumber: vpoOrder.poNumber,
          customerName: vpoOrder.customerFullName || vpoOrder.storeName || 'Valued Customer',
          orderType: vpoOrder.orderType || '—',
          quotedCost: vpoOrder.quotedCost ? Number(vpoOrder.quotedCost) : undefined,
          orderId: vpoOrder.id,
        }).catch(err => this.logger.warn('Order in production email failed:', err));
      }

      // Notify Admin + Authorizer: VPO issued, needs a supplier/factory assignment
      // before it becomes visible to production.
      const assignerUsers = await this.userRepo.find({ where: { role: In([UserRole.ADMIN, UserRole.AUTHORIZER]) } });
      await Promise.all(assignerUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.STATUS_CHANGED,
          title: `Assign Supplier — ${vpoOrder.poNumber}`,
          message: `Order ${vpoOrder.poNumber} has been approved (VPO Issued). Select a stone supplier and factory to release it to production.`,
          orderId: vpoOrder.id,
          targetUserId: u.id,
          isPriority: vpoOrder.isPriorityCustomer,
        })),
      ));
      // Email both Admin and Authorizer — either can complete the Assign Supplier step.
      const assignerEmails = assignerUsers.map(u => u.email).filter(Boolean);
      this.emailService.sendAssignSupplierAlert({
        to: assignerEmails,
        poNumber: vpoOrder.poNumber,
        orderType: vpoOrder.orderType || '—',
        orderId: vpoOrder.id,
        isPriorityCustomer: vpoOrder.isPriorityCustomer,
      }).catch(err => this.logger.warn('Assign supplier alert email failed:', err));

      return vpoOrder;
    }

    // Require contractor name when moving to REPAIR
    if (status === OrderStatus.REPAIR) {
      if (!repairContractor || !repairContractor.trim()) {
        throw new BadRequestException('Contractor name is required when sending an order for repair');
      }
      return this.update(id, { status: OrderStatus.REPAIR, repairContractor: repairContractor.trim() }, user);
    }

    // VPO_ISSUED → MANUFACTURED requires a supplier assignment and (for Factory
    // Manager specifically) a received stone — guards against jumping the queue
    // via a direct API call before "Assign Supplier" has run.
    if (status === OrderStatus.MANUFACTURED) {
      const currentOrder = await this.findOne(id);
      if (!currentOrder.assignedFactory || !currentOrder.supplySource) {
        throw new BadRequestException('Assign a stone supplier and factory before marking this order as manufactured.');
      }
      if (user?.role === 'FACTORY_MANAGER' && currentOrder.stoneStatus !== StoneStatus.STONE_RECEIVED) {
        throw new BadRequestException('Stone must be received before marking order as manufactured');
      }
    }

    const patch: Partial<Order> = { status };
    if (quotedCost) patch.quotedCost = quotedCost;
    const updated = await this.update(id, patch, user);
    this.logEvent(id, 'STATUS_CHANGE', user, existing.status, status);

    // NEW → CAD_IN_PROGRESS: notify CAD designers
    if (status === OrderStatus.CAD_IN_PROGRESS) {
      const cadUsers = await this.userRepo.find({ where: { role: In([UserRole.CAD_DESIGNER]) } });
      const cadEmails = cadUsers.filter(u => u.role === UserRole.CAD_DESIGNER).map(u => u.email).filter(Boolean);
      await Promise.all(cadUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.ORDER_CREATED,
          title: `New CAD Job — ${updated.poNumber}`,
          message: `Order ${updated.poNumber} is ready for CAD design.`,
          orderId: updated.id,
          targetUserId: u.id,
          isPriority: updated.isPriorityCustomer,
        })),
      ));
      if (cadEmails.length) {
        this.emailService.sendPendingCadToDesigners({
          to: cadEmails,
          poNumber: updated.poNumber,
          customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
          orderType: updated.orderType || '—',
          orderId: updated.id,
          isPriorityCustomer: updated.isPriorityCustomer,
        }).catch(err => this.logger.warn('Pending CAD designer email failed:', err));
      }
      if (updated.customerEmail) {
        this.emailService.sendOrderConfirmedToCustomer({
          to:           updated.customerEmail,
          poNumber:     updated.poNumber,
          customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
          orderType:    updated.orderType || '—',
          orderId:      updated.id,
        }).catch(err => this.logger.warn('Order confirmed customer email failed:', err));
      }
    }

    // MANUFACTURED — notify Admin + Authorizer (US team to receive), matching
    // the Admin+Authorizer alert already sent when the VPO is issued.
    if (status === OrderStatus.MANUFACTURED) {
      const teamUsers = await this.userRepo.find({ where: { role: In([UserRole.ADMIN, UserRole.AUTHORIZER]) } });
      await Promise.all(teamUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.STATUS_CHANGED,
          title: `Manufactured — ${updated.poNumber}`,
          message: `Order ${updated.poNumber} has been manufactured and is en route to the US office.`,
          orderId: updated.id,
          targetUserId: u.id,
          isPriority: updated.isPriorityCustomer,
        })),
      ));
      const teamEmails = teamUsers.map(u => u.email).filter(Boolean);
      this.emailService.sendOrderManufacturedAlert({
        to: teamEmails,
        poNumber: updated.poNumber,
        orderType: updated.orderType || '—',
        orderId: updated.id,
        isPriorityCustomer: updated.isPriorityCustomer,
      }).catch(err => this.logger.warn('Order manufactured alert email failed:', err));
    }

    // SHIPPED — email customer + authorizers
    if (status === OrderStatus.SHIPPED) {
      if (updated.customerEmail) {
        this.emailService.sendOrderShipped({
          to: updated.customerEmail,
          poNumber: updated.poNumber,
          customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
          orderType: updated.orderType || '—',
          trackingNumber: updated.trackingNumber,
          shipMethod: updated.shipMethod,
          orderId: updated.id,
        }).catch(err => this.logger.warn('Order shipped email failed:', err));
      }
      // In-portal notification for authorizers (no email)
      const teamUsers = await this.userRepo.find({ where: { role: In([UserRole.AUTHORIZER]) } });
      await Promise.all(teamUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.ORDER_SHIPPED,
          title: `Order Shipped — ${updated.poNumber}`,
          message: `Order ${updated.poNumber} has been shipped${updated.trackingNumber ? ` (${updated.trackingNumber})` : ''}.`,
          orderId: updated.id,
          targetUserId: u.id,
          isPriority: updated.isPriorityCustomer,
        })),
      ));
    }

    // COMPLETED — email customer
    if (status === OrderStatus.COMPLETED && updated.customerEmail) {
      this.emailService.sendOrderDelivered({
        to: updated.customerEmail,
        poNumber: updated.poNumber,
        customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
        orderType: updated.orderType || '—',
        orderId: updated.id,
      }).catch(err => this.logger.warn('Order delivered email failed:', err));
    }

    return updated;
  }

  // Admin-only: un-cancels an order, restoring whichever status it was in
  // immediately before cancellation (read off the STATUS_CHANGE event
  // updateStatus() logs when cancelling) rather than asking the caller to
  // pick one — falls back to NEW only for orders cancelled before that
  // event logging existed, which have no such record.
  async reactivateOrder(id: string, user?: { id?: string; email: string; role: string }): Promise<Order> {
    const order = await this.findOne(id);
    if (order.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException(`Order ${order.poNumber} is not cancelled.`);
    }

    const lastCancelEvent = await this.eventRepo.findOne({
      where: { orderId: id, action: 'STATUS_CHANGE', toStatus: OrderStatus.CANCELLED },
      order: { createdAt: 'DESC' },
    });
    const restoredStatus = (lastCancelEvent?.fromStatus as OrderStatus) || OrderStatus.NEW;

    const reactivated = await this.update(id, { status: restoredStatus, isArchived: false }, user);
    this.logEvent(id, 'STATUS_CHANGE', user, OrderStatus.CANCELLED, restoredStatus, 'Reactivated by Admin');
    return reactivated;
  }

  // Admin/Authorizer only — routes an already-approved (VPO_ISSUED) order to a
  // specific factory and stone supplier. This is the only thing that makes the
  // order visible to any Factory/Stone Manager: notifications and visibility are
  // scoped to whichever accounts are tagged with this exact factory/supplySource,
  // never a blanket "all factory managers" broadcast.
  async assignSupplier(
    id: string,
    factory: Factory,
    supplySource: SupplySource,
    user?: { id?: string; email: string; role: string },
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.VPO_ISSUED) {
      throw new BadRequestException('Supplier can only be assigned once the VPO has been issued.');
    }

    order.assignedFactory = factory;
    order.supplySource = supplySource;
    const saved = await this.orderRepo.save(order);
    this.logEvent(id, 'SUPPLIER_ASSIGNED', user, undefined, undefined, `Factory: ${factory}, Supply source: ${supplySource}`);

    // Matched by tag, not role — a Stone Manager account can also be tagged with
    // a factory (e.g. Archana covers both stones and factory orders for Creations)
    // and still gets the factory-side notification alongside her Stone Manager one.
    const [factoryUsers, stoneUsers] = await Promise.all([
      this.userRepo.find({ where: { assignedFactory: factory } }),
      this.userRepo.find({ where: { assignedSupplySource: supplySource } }),
    ]);

    await Promise.all([
      ...factoryUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.STATUS_CHANGED,
          title: `VPO Issued — ${saved.poNumber}`,
          message: `Order ${saved.poNumber} has been issued to your factory for manufacturing.`,
          orderId: saved.id,
          targetUserId: u.id,
          isPriority: saved.isPriorityCustomer,
        })),
      ),
      ...stoneUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.STATUS_CHANGED,
          title: `VPO Issued — ${saved.poNumber}`,
          message: `Order ${saved.poNumber} is ready — please arrange stones.`,
          orderId: saved.id,
          targetUserId: u.id,
          isPriority: saved.isPriorityCustomer,
        })),
      ),
    ]);

    // Standing recipients (e.g. the Creations distribution list) always get
    // the alert alongside whichever real FACTORY_MANAGER accounts are tagged
    // to this factory — they're plain email addresses, not accounts, so no
    // user row is created or required for them.
    const factoryEmails = Array.from(new Set([
      ...factoryUsers.map(u => u.email).filter(Boolean),
      ...(STANDING_FACTORY_RECIPIENTS[factory] || []),
    ]));
    // A factory with no tagged FACTORY_MANAGER and no STANDING_FACTORY_RECIPIENTS
    // entry produces an empty `to` list, which EmailService used to treat as a
    // silent no-op — the assignment would save fine (so the portal shows it)
    // while the factory never got an email, with nothing logged anywhere. Flag
    // it loudly here too, right where the data gap actually is.
    if (!factoryEmails.length) {
      const msg = `Order ${saved.poNumber} assigned to factory "${factory}" but no email recipients are configured for it (no tagged FACTORY_MANAGER, no STANDING_FACTORY_RECIPIENTS entry).`;
      this.logger.error(msg);
      Sentry.captureMessage(msg, 'error');
    }
    // A failure — or a hang — building attachments must never take the email
    // down with it: fall back to sending with no attachments rather than
    // silently skipping the notification. buildFactoryOrderPdfAttachment
    // rejecting is one way that used to happen; it hanging indefinitely
    // (e.g. an unresponsive file host mid-fetch) was another, worse one —
    // nothing downstream of a hung, un-awaited promise ever runs, so neither
    // the email nor any error log ever appears. The timeout below bounds it.
    (async () => {
      let attachments: { filename: string; content: Buffer }[];
      try {
        const result = await withTimeout(this.buildFactoryOrderPdfAttachment(saved), FACTORY_ATTACHMENT_BUILD_TIMEOUT_MS);
        if (result === TIMED_OUT) {
          const msg = `Factory order attachment build timed out after ${FACTORY_ATTACHMENT_BUILD_TIMEOUT_MS}ms for ${saved.poNumber} — sending the factory alert without attachments rather than blocking it indefinitely.`;
          this.logger.warn(msg);
          Sentry.captureMessage(msg, 'warning');
          attachments = [];
        } else {
          attachments = result;
        }
      } catch (err) {
        this.logger.warn(`Factory order attachment build failed for ${saved.poNumber}:`, err);
        attachments = [];
      }

      const sent = await this.emailService.sendFactoryAssignedAlert({
        to: factoryEmails,
        poNumber: saved.poNumber,
        orderType: saved.orderType || '—',
        orderId: saved.id,
        isPriorityCustomer: saved.isPriorityCustomer,
        attachments,
      });
      // sendFactoryAssignedAlert already alerts ops when `to` is empty
      // (`sent` is undefined then). `sent === false` is every other way the
      // send can fail (SMTP rejection, oversized attachment, etc.) — those
      // used to only ever reach a raw log line nobody watches.
      if (sent === false) {
        this.emailService.sendInternalFailureAlert(
          'Factory assigned alert failed to send',
          `Order ${saved.poNumber} (factory "${factory}") — sendFactoryAssignedAlert returned false; see the preceding "Email send failed" log line for the underlying error.`,
        );
      }
    })().catch(err => {
      this.logger.warn('Factory assigned alert pipeline failed:', err);
      Sentry.captureException(err);
      this.emailService.sendInternalFailureAlert(
        'Factory assigned alert pipeline failed',
        `Order ${saved.poNumber} (factory "${factory}") — unexpected error: ${(err as Error)?.message ?? err}`,
      );
    });

    const stoneEmails = stoneUsers.map(u => u.email).filter(Boolean);
    this.emailService.sendStoneSupplierAssignedAlert({
      to: stoneEmails,
      poNumber: saved.poNumber,
      orderType: saved.orderType || '—',
      orderId: saved.id,
      isPriorityCustomer: saved.isPriorityCustomer,
    }).then(sent => {
      if (sent === false) {
        this.emailService.sendInternalFailureAlert(
          'Stone supplier assigned alert failed to send',
          `Order ${saved.poNumber} (supply source "${supplySource}") — sendStoneSupplierAssignedAlert returned false; see the preceding "Email send failed" log line for the underlying error.`,
        );
      }
    }).catch(err => {
      this.logger.warn('Stone supplier assigned alert email failed:', err);
      Sentry.captureException(err);
      this.emailService.sendInternalFailureAlert(
        'Stone supplier assigned alert email failed',
        `Order ${saved.poNumber} (supply source "${supplySource}") — sendStoneSupplierAssignedAlert threw: ${(err as Error)?.message ?? err}`,
      );
    });

    return saved;
  }

  // Manual recovery lever for exactly the failure class assignSupplier's
  // fire-and-forget email can hit silently (see the empty-recipients check
  // and Sentry wiring above) — lets staff re-send the "order issued to your
  // factory" alert for an already-assigned order, awaited this time, so the
  // caller gets an immediate, honest success/failure result instead of a
  // detached promise nobody is watching.
  async resendFactoryAssignedAlert(id: string): Promise<{ sent: boolean; recipientCount: number; recipients: string[] }> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (!order.assignedFactory) {
      throw new BadRequestException(`Order ${order.poNumber} has no assigned factory to notify.`);
    }

    const factoryUsers = await this.userRepo.find({ where: { assignedFactory: order.assignedFactory } });
    const recipients = Array.from(new Set([
      ...factoryUsers.map(u => u.email).filter(Boolean),
      ...(STANDING_FACTORY_RECIPIENTS[order.assignedFactory] || []),
    ]));
    if (!recipients.length) {
      throw new BadRequestException(`No email recipients configured for factory "${order.assignedFactory}" — add one to STANDING_FACTORY_RECIPIENTS or tag a FACTORY_MANAGER to it.`);
    }

    const attachmentResult = await withTimeout(this.buildFactoryOrderPdfAttachment(order), FACTORY_ATTACHMENT_BUILD_TIMEOUT_MS);
    if (attachmentResult === TIMED_OUT) {
      this.logger.warn(`Factory order attachment build timed out after ${FACTORY_ATTACHMENT_BUILD_TIMEOUT_MS}ms for ${order.poNumber} (manual resend) — sending without attachments.`);
    }
    const attachments = attachmentResult === TIMED_OUT ? [] : attachmentResult;
    const sent = await this.emailService.sendFactoryAssignedAlert({
      to: recipients,
      poNumber: order.poNumber,
      orderType: order.orderType || '—',
      orderId: order.id,
      isPriorityCustomer: order.isPriorityCustomer,
      attachments,
    });

    return { sent: !!sent, recipientCount: recipients.length, recipients };
  }

  // One-time cleanup for orders approved before the fix above existed: staff
  // approving a CAD "on behalf of the customer" via Move to Stage → VPO
  // Issued advanced the order without ever updating the CadFile row, leaving
  // it stuck on SENT_FOR_APPROVAL ("Awaiting Approval" in the UI) even though
  // the order had already moved well past that stage. Safe to re-run — only
  // touches CAD files that are still SENT_FOR_APPROVAL on an order that's
  // already progressed beyond CAD_IN_PROGRESS.
  async backfillStuckCadApprovals(): Promise<{ updated: number }> {
    const advancedOrders = await this.orderRepo.find({
      where: { status: In([OrderStatus.VPO_ISSUED, OrderStatus.MANUFACTURED, OrderStatus.SHIPPED, OrderStatus.COMPLETED]) },
      select: ['id'],
    });
    if (!advancedOrders.length) return { updated: 0 };

    const result = await this.cadRepo.update(
      { orderId: In(advancedOrders.map(o => o.id)), status: CadFileStatus.SENT_FOR_APPROVAL },
      { status: CadFileStatus.APPROVED, approvedAt: new Date(), approvedBy: 'backfill' },
    );
    return { updated: result.affected || 0 };
  }

  // Reference/customer photos are for internal and customer-facing use only —
  // the factory needs the actual uploaded CAD design files, not a reference photo.
  private static readonly REFERENCE_NOTE_TAGS = new Set(['Reference image', 'Customer reference image']);

  // Raw CAD source files (.3dm, .stl, .obj, etc.) are large binary model
  // files, not something a factory needs opened in an inbox — they're also
  // what was actually timing out / bloating this email past deliverable
  // size. Only images and PDFs get attached.
  private static readonly ATTACHABLE_FILE_RE = /\.(jpe?g|png|gif|webp|bmp|tiff?|svg|pdf)$/i;

  // Builds the product-detail PDF (no customer name/company/pricing — same
  // redaction as the Factory Manager portal view) plus every APPROVED CAD
  // design image/PDF — attached to the factory-assigned email. A failure on
  // any single piece (PDF render or one file fetch) shouldn't block the rest
  // of the email.
  private async buildFactoryOrderPdfAttachment(order: Order): Promise<{ filename: string; content: Buffer }[]> {
    const attachments: { filename: string; content: Buffer }[] = [];

    try {
      const pdf = await buildFactoryOrderPdf(order);
      attachments.push({ filename: `${order.poNumber}-manufacturing-order.pdf`, content: pdf });
    } catch (err) {
      this.logger.warn(`Factory order PDF generation failed for ${order.poNumber}:`, err);
    }

    let cadFiles: { designerNotes?: string | null; filePath: string; originalName: string }[] = [];
    try {
      cadFiles = await this.cadRepo.find({ where: { orderId: order.id, status: CadFileStatus.APPROVED } });
    } catch (err) {
      this.logger.warn(`Failed to load CAD files for ${order.poNumber}:`, err);
    }
    const designFiles = cadFiles.filter(c =>
      (!c.designerNotes || !OrdersService.REFERENCE_NOTE_TAGS.has(c.designerNotes))
      && OrdersService.ATTACHABLE_FILE_RE.test(c.originalName),
    );
    // Fetched in parallel, not one at a time — the overall step is capped at
    // FACTORY_ATTACHMENT_BUILD_TIMEOUT_MS, so with many design files a
    // sequential loop could exhaust that budget after only the first few,
    // silently dropping the rest even though they'd have succeeded. Each
    // fetch still has its own timeout so one slow/unresponsive file host
    // can't hang the others.
    const fetchResults = await Promise.allSettled(designFiles.map(async cad => {
      const res = await fetch(cad.filePath, { signal: AbortSignal.timeout(CAD_FILE_FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { filename: cad.originalName, content: Buffer.from(await res.arrayBuffer()) };
    }));
    fetchResults.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        attachments.push(result.value);
      } else {
        this.logger.warn(`Failed to fetch CAD file "${designFiles[i].originalName}" for ${order.poNumber}:`, result.reason);
      }
    });

    return attachments;
  }

  // Admin/Authorizer only — sets the list of price options shown to the customer
  // while they decide (e.g. different metal/quality tiers for the same design).
  // Purely informational: issuing the VPO still requires quotedCost to be set
  // separately once a final price is agreed.
  async updateQuoteOptions(
    id: string,
    options: { label?: string; price: number }[],
    user?: { id?: string; email: string; role: string },
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    order.quoteOptions = options.map(o => ({ label: o.label?.trim() || '', price: Number(o.price) }));
    const saved = await this.orderRepo.save(order);
    this.logEvent(id, 'QUOTE_OPTIONS_UPDATED', user, undefined, undefined, `${options.length} option(s)`);
    return saved;
  }

  async authorize(id: string): Promise<Order> {
    // Kept for API compatibility — orders now start at CAD_IN_PROGRESS directly.
    // This notifies CAD designers that a new order is ready.
    const order = await this.findOne(id);
    const cadUsers = await this.userRepo.find({ where: { role: In([UserRole.CAD_DESIGNER]) } });
    await Promise.all(cadUsers.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type: NotificationType.STATUS_CHANGED,
        title: `New CAD Job — ${order.poNumber}`,
        message: `Order ${order.poNumber} is ready for CAD design.`,
        orderId: order.id,
        targetUserId: u.id,
        isPriority: order.isPriorityCustomer,
      })),
    ));
    return order;
  }

  async findPriority(user: { id: string; email: string; role: string; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null }): Promise<any[]> {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const FINAL = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];
    const results: any[] = [];

    // Role-specific SLA checks
    const role = user.role;

    // Base query scoped to what this role is responsible for
    const ROLE_STATUSES: Partial<Record<string, OrderStatus[]>> = {
      [UserRole.CAD_DESIGNER]:    [OrderStatus.CAD_IN_PROGRESS],
      [UserRole.AUTHORIZER]:      [OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS, OrderStatus.VPO_ISSUED, OrderStatus.MANUFACTURED, OrderStatus.SHIPPED],
      [UserRole.FACTORY_MANAGER]: [OrderStatus.VPO_ISSUED],
      [UserRole.STONE_MANAGER]:   [OrderStatus.VPO_ISSUED],
    };

    const qb = () => {
      const q = this.orderRepo.createQueryBuilder('o').where('o.isArchived = false');
      const allowed = ROLE_STATUSES[role];
      if (allowed) q.andWhere('o.status IN (:...rs)', { rs: allowed });
      if (role === UserRole.SALES_REP && user.id) {
        q.andWhere(
          '(o.salesRepId = :uid OR (o.companyId IS NOT NULL AND o.companyId IN (SELECT c.id::text FROM companies c WHERE c."salesRepId" = :uid)))',
          { uid: user.id },
        );
      }
      if (role === UserRole.STONE_MANAGER) {
        q.andWhere('o.supplySource = :assignedSupplySource', { assignedSupplySource: user.assignedSupplySource ?? null });
      }
      if (role === UserRole.FACTORY_MANAGER) {
        q.andWhere('o.assignedFactory = :assignedFactory', { assignedFactory: user.assignedFactory ?? null });
      }
      return q;
    };

    // Fire every role-relevant query concurrently instead of one-at-a-time —
    // each round trip to the DB was adding its own latency in series.
    const none = Promise.resolve([] as Order[]);
    const [
      revisionOrders,
      priorityCustomers,
      vpoOverdueStone,
      vpoOverdueFactory,
    ] = await Promise.all([
      // CAD revision requested — always CRITICAL
      qb()
        .andWhere('o.status = :s', { s: OrderStatus.CAD_IN_PROGRESS })
        .andWhere('o."cadSubStatus" = :r', { r: 'REVISION' })
        .getMany(),
      // Priority customer orders — scoped to role's status domain
      qb()
        .andWhere('o.isPriorityCustomer = true')
        .andWhere('o.status NOT IN (:...fin)', { fin: FINAL })
        .getMany(),
      // Stone Manager: stone still pending > 2 days since the VPO was issued
      [UserRole.STONE_MANAGER, UserRole.ADMIN].includes(role as UserRole)
        ? (() => {
            const q = this.orderRepo.createQueryBuilder('o')
              .where('o.isArchived = false')
              .andWhere('o.status = :s', { s: OrderStatus.VPO_ISSUED })
              .andWhere('(o.stoneStatus = :pending OR o.stoneStatus IS NULL)', { pending: StoneStatus.PENDING_STONE })
              .andWhere('o."vpoIssuedAt" IS NOT NULL AND o."vpoIssuedAt" < :d', { d: daysAgo(2) });
            // Admin still sees every pending-stone order regardless of supplier (they
            // may need to chase whoever it's assigned to) — only Stone Manager's own
            // view excludes orders they weren't personally assigned.
            if (role === UserRole.STONE_MANAGER) {
              q.andWhere('o.supplySource = :assignedSupplySource', { assignedSupplySource: user.assignedSupplySource ?? null });
            }
            return q.getMany();
          })()
        : none,
      // Factory: still in VPO Issued > 6 days since it was issued
      [UserRole.FACTORY_MANAGER, UserRole.ADMIN].includes(role as UserRole)
        ? (() => {
            const q = this.orderRepo.createQueryBuilder('o')
              .where('o.isArchived = false')
              .andWhere('o.status = :s', { s: OrderStatus.VPO_ISSUED })
              .andWhere('o."vpoIssuedAt" IS NOT NULL AND o."vpoIssuedAt" < :d', { d: daysAgo(6) });
            if (role === UserRole.FACTORY_MANAGER) {
              q.andWhere('o.assignedFactory = :assignedFactory', { assignedFactory: user.assignedFactory ?? null });
            }
            return q.getMany();
          })()
        : none,
    ]);

    // Same precedence as before: earlier blocks win when an order matches more than one rule.
    revisionOrders.forEach(o => results.push({ ...o, priorityReason: 'Customer requested CAD revision', priorityLevel: 'CRITICAL' }));
    priorityCustomers.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'Priority Customer', priorityLevel: 'HIGH' });
    });
    vpoOverdueStone.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'Stone pending — over 2 days since VPO issued', priorityLevel: 'HIGH' });
    });
    vpoOverdueFactory.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'In VPO stage — over 6 days since issued', priorityLevel: 'MEDIUM' });
    });

    const LEVEL_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    return results.sort((a, b) => {
      const diff = (LEVEL_ORDER[a.priorityLevel] ?? 9) - (LEVEL_ORDER[b.priorityLevel] ?? 9);
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  async getForFactory() {
    return this.orderRepo.find({
      where: { status: OrderStatus.VPO_ISSUED },
      order: { updatedAt: 'ASC' },
    });
  }

  async getKanbanBoard(user?: { id: string; role: string; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null }) {
    const statuses = Object.values(OrderStatus);

    const buildBase = () => {
      // Cancelling an order also archives it, so the blanket isArchived
      // filter would hide the Cancelled column entirely — let cancelled
      // orders through regardless of archive state so this board's count
      // matches the Orders list's Cancelled filter.
      const q = this.orderRepo.createQueryBuilder('o')
        .where('(o.isArchived = false OR o.status = :cancelledStatus)', { cancelledStatus: OrderStatus.CANCELLED });
      if (user?.role === 'SALES_REP') {
        q.andWhere(
          '(o.salesRepId = :salesRepId OR (o.companyId IS NOT NULL AND o.companyId IN (SELECT c.id::text FROM companies c WHERE c."salesRepId" = :salesRepId)))',
          { salesRepId: user.id },
        );
      } else if (user?.role === 'CAD_DESIGNER') {
        q.andWhere('o.status IN (:...cadStatuses)', { cadStatuses: CAD_STATUSES });
      } else if (user?.role === 'FACTORY_MANAGER') {
        q.andWhere('o.kiraSkuNumber IS NOT NULL');
        q.andWhere('o.assignedFactory = :assignedFactory', { assignedFactory: user.assignedFactory ?? null });
      } else if (user?.role === 'STONE_MANAGER') {
        q.andWhere('o.status = :vpoStatus', { vpoStatus: OrderStatus.VPO_ISSUED });
        q.andWhere('o.supplySource = :assignedSupplySource', { assignedSupplySource: user.assignedSupplySource ?? null });
      }
      return q;
    };

    // One query for the rows (most-recent-first, capped) + one lightweight
    // grouped count — replaces the previous 8 separate per-status queries.
    // Row query only selects what the Kanban card actually renders, instead
    // of the full entity (customer notes, financial fields the card doesn't
    // show, etc.) — the payload shrinks accordingly as order volume grows.
    const [allOrders, rawCounts] = await Promise.all([
      buildBase()
        .select([
          'o.id', 'o.poNumber', 'o.kiraSkuNumber', 'o.status', 'o.cadSubStatus',
          'o.sentToCustomer', 'o.stoneStatus', 'o.supplySource', 'o.assignedFactory', 'o.isPriorityCustomer', 'o.quotedCost',
          'o.orderType', 'o.metalType', 'o.metalColor', 'o.salesRepName', 'o.salesRepEmail',
          'o.storeName', 'o.customerFullName', 'o.createdAt', 'o.updatedAt',
        ])
        .orderBy('o.updatedAt', 'DESC').take(3000).getMany(),
      buildBase().select('o.status', 'status').addSelect('COUNT(*)', 'count').groupBy('o.status').getRawMany(),
    ]);

    const countByStatus = new Map<string, number>(rawCounts.map((r: any) => [r.status, parseInt(r.count, 10)]));
    const ordersByStatus = new Map<string, Order[]>();
    for (const o of allOrders) {
      const list = ordersByStatus.get(o.status) || [];
      list.push(o);
      ordersByStatus.set(o.status, list);
    }

    return statuses.map(status => ({
      status,
      orders: (ordersByStatus.get(status) || []).slice(0, 500),
      count: countByStatus.get(status) || 0,
    }));
  }

  async getMetrics() {
    const total = await this.orderRepo.count({ where: { isArchived: false } });
    const byStatus = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o.isArchived = false')
      .groupBy('o.status')
      .getRawMany();
    const revenue = await this.orderRepo
      .createQueryBuilder('o')
      .select('SUM(o.quotedCost)', 'total')
      .where('o.status NOT IN (:...ex)', { ex: [OrderStatus.CANCELLED] })
      .getRawOne();
    return { total, byStatus, totalRevenue: revenue?.total || 0 };
  }
}
