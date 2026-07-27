import { Injectable, OnModuleInit, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes } from 'crypto';
import { Order, OrderStatus, StoneStatus, SupplySource, Factory } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { Sku } from '../../database/entities/sku.entity';
import { Company } from '../../database/entities/company.entity';
import { EmailService } from '../email/email.service';
import { OrderFilterDto } from './dto/order-filter.dto';
import { SkuService } from '../sku/sku.service';
import { STANDING_FACTORY_RECIPIENTS } from './factory-notification-recipients';
import { buildFactoryOrderPdf } from './factory-order-pdf.util';

export { OrderFilterDto };

const CAD_STATUSES = [OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS];

// Product spec fields — editable via PUT /orders/:id, Admin/Authorizer only
const EDITABLE_SPEC_KEYS = ['metalType', 'metalColor', 'size', 'quantity', 'stamping', 'diamondType', 'diamondQuality', 'centerStoneShape', 'approximateCaratWeight'];

// Customer detail fields — editable via PUT /orders/:id, Admin only
const EDITABLE_CUSTOMER_KEYS = ['storeName', 'customerFullName', 'customerEmail', 'phoneNumber'];

// Admin-only fields editable via PUT /orders/:id outside the status-change flow
const ADMIN_ONLY_KEYS = ['supplySource', 'assignedFactory', 'quoteOptions', 'isPriorityCustomer'];

// Fields worth diffing into the audit log when changed via PUT /orders/:id —
// price, spec, customer details, and the committed ship date. Human-readable
// labels used in the logged note.
const TRACKED_FIELD_LABELS: Record<string, string> = {
  quotedCost: 'Price',
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

    if (filters.search) {
      const escaped = filters.search.replace(/[%_\\]/g, c => `\\${c}`);
      qb.andWhere(
        '(order.poNumber ILIKE :s OR order.storeName ILIKE :s OR order.kiraSkuNumber ILIKE :s OR order.customerFullName ILIKE :s OR order.customerEmail ILIKE :s OR order.vendorName ILIKE :s)',
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
      .addOrderBy('order.createdAt', 'DESC')
      .skip(filters.offset || 0)
      .take(filters.limit || 50);
    const [orders, total] = await qb.getManyAndCount();
    return { orders, total };
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
  ): Promise<Order> {
    if (user?.role === 'CUSTOMER') {
      throw new ForbiddenException('Not authorized to change order status directly');
    }

    // Manual cancellation by admin/authorizer → deactivate (allowed from any active status)
    if (status === OrderStatus.CANCELLED) {
      return this.update(id, { status: OrderStatus.CANCELLED, isArchived: true }, user);
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
      if (!order.kiraSkuNumber) {
        await this.skuService.generate(id, user?.email);
      }
      const vpoOrder = await this.update(id, { status, quotedCost: finalPrice, vpoIssuedAt: new Date() }, user);
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
      // Email only Admin — Authorizer still sees the in-app notification above but
      // shouldn't be emailed to assign the supplier.
      const assignerAdminEmails = assignerUsers.filter(u => u.role === UserRole.ADMIN).map(u => u.email).filter(Boolean);
      this.emailService.sendAssignSupplierAlert({
        to: assignerAdminEmails,
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
    // A failure building attachments must never take the email down with it —
    // fall back to sending with no attachments rather than silently skipping
    // the notification (this is what actually happens if buildFactoryOrderPdfAttachment
    // rejects: the .then() below would never run and the factory team gets nothing).
    this.buildFactoryOrderPdfAttachment(saved)
      .catch(err => {
        this.logger.warn(`Factory order attachment build failed for ${saved.poNumber}:`, err);
        return [];
      })
      .then(attachments =>
        this.emailService.sendFactoryAssignedAlert({
          to: factoryEmails,
          poNumber: saved.poNumber,
          orderType: saved.orderType || '—',
          orderId: saved.id,
          isPriorityCustomer: saved.isPriorityCustomer,
          attachments,
        }),
      ).catch(err => this.logger.warn('Factory assigned alert email failed:', err));

    const stoneEmails = stoneUsers.map(u => u.email).filter(Boolean);
    this.emailService.sendStoneSupplierAssignedAlert({
      to: stoneEmails,
      poNumber: saved.poNumber,
      orderType: saved.orderType || '—',
      orderId: saved.id,
      isPriorityCustomer: saved.isPriorityCustomer,
    }).catch(err => this.logger.warn('Stone supplier assigned alert email failed:', err));

    return saved;
  }

  // Reference/customer photos are for internal and customer-facing use only —
  // the factory needs the actual uploaded CAD design files, not a reference photo.
  private static readonly REFERENCE_NOTE_TAGS = new Set(['Reference image', 'Customer reference image']);

  // Builds the product-detail PDF (no customer name/company/pricing — same
  // redaction as the Factory Manager portal view) plus every uploaded CAD
  // design file — any file type, the factory needs the actual source file —
  // attached to the factory-assigned email. A failure on any single piece
  // (PDF render or one file fetch) shouldn't block the rest of the email.
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
      cadFiles = await this.cadRepo.find({ where: { orderId: order.id } });
    } catch (err) {
      this.logger.warn(`Failed to load CAD files for ${order.poNumber}:`, err);
    }
    const designFiles = cadFiles.filter(c => !c.designerNotes || !OrdersService.REFERENCE_NOTE_TAGS.has(c.designerNotes));
    for (const cad of designFiles) {
      try {
        const res = await fetch(cad.filePath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        attachments.push({ filename: cad.originalName, content: Buffer.from(await res.arrayBuffer()) });
      } catch (err) {
        this.logger.warn(`Failed to fetch CAD file "${cad.originalName}" for ${order.poNumber}:`, err);
      }
    }

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
      const q = this.orderRepo.createQueryBuilder('o').where('o.isArchived = false');
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
