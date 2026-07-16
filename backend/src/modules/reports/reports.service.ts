import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { User } from '../../database/entities/user.entity';
import { EmailService } from '../email/email.service';
import { buildWeeklyReportPdf, WeeklyStats } from './weekly-report-pdf.util';

const REFERENCE_NOTE_TAGS = new Set(['Reference image', 'Customer reference image']);
const MANUFACTURING_LIMIT_DAYS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_RECIPIENT = 'mehul@kirajewels.one';

const msToDays = (ms: number | null): number | null => (ms === null ? null : ms / DAY_MS);
const avg = (arr: number[]): number | null => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const pctChange = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

interface CoreMetrics {
  ordersReceived: number;
  cadsApproved: number;
  cadsRevised: number;
  avgCadTurnaroundMs: number | null;
}

interface StageEventMap {
  cadStart?: Date;
  vpoIssued?: Date;
  supplierAssigned?: Date;
  manufactured?: Date;
}

interface ShippedRecord {
  orderId: string;
  onTime: boolean | null;
  groupKey: string;
  groupName: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(CadFile) private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(OrderEvent) private readonly eventRepo: Repository<OrderEvent>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly emailService: EmailService,
  ) {}

  // Every Monday at 8:00 AM server time — covers the Monday-through-Sunday
  // week that just ended (yesterday and the 6 days before it).
  @Cron('0 8 * * 1')
  async sendScheduledWeeklyReport(): Promise<void> {
    const now = new Date();
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    const weekStart = new Date(weekEnd.getTime() - 6 * DAY_MS);
    weekStart.setHours(0, 0, 0, 0);
    await this.sendWeeklyReport(weekStart, weekEnd);
  }

  // `to` only exists so Admin can send a one-off test copy elsewhere via the
  // manual endpoint — the Monday cron above never passes it, so the real
  // scheduled send always goes to REPORT_RECIPIENT.
  async sendWeeklyReport(weekStart: Date, weekEnd: Date, to?: string): Promise<void> {
    const stats = await this.getWeeklyStats(weekStart, weekEnd);
    const pdf = await buildWeeklyReportPdf(stats);

    const range = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const recipient = to || REPORT_RECIPIENT;
    await this.emailService.send({
      to: recipient,
      subject: `Weekly Operations Report — ${range}`,
      html: `<p style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1A2740">The weekly operations report for ${range} is attached.</p>`,
      attachments: [{ filename: `weekly-report-${weekStart.toISOString().slice(0, 10)}.pdf`, content: pdf }],
    });
    this.logger.log(`Weekly operations report sent for ${range} to ${recipient}`);
  }

  async getWeeklyStats(weekStart: Date, weekEnd: Date): Promise<WeeklyStats> {
    const prevWeekEnd = new Date(weekStart.getTime() - 1);
    const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);

    const [core, prevCore, designers, stages, shippedThisWeek, customerGroups] = await Promise.all([
      this.computeCoreMetrics(weekStart, weekEnd),
      this.computeCoreMetrics(prevWeekStart, prevWeekEnd),
      this.computeDesignerStats(weekStart, weekEnd),
      this.computeStageDurations(weekStart, weekEnd),
      this.getShippedRecords(weekStart, weekEnd),
      this.computeCustomerGroups(weekStart, weekEnd),
    ]);

    const onTimeJudged = shippedThisWeek.filter(s => s.onTime !== null);
    const onTimeCount = onTimeJudged.filter(s => s.onTime).length;
    const shippedOnTimePct = onTimeJudged.length ? Math.round((onTimeCount / onTimeJudged.length) * 100) : null;

    const prevOnTimeJudged = (await this.getShippedRecords(prevWeekStart, prevWeekEnd)).filter(s => s.onTime !== null);
    const prevShippedOnTimePct = prevOnTimeJudged.length
      ? Math.round((prevOnTimeJudged.filter(s => s.onTime).length / prevOnTimeJudged.length) * 100)
      : null;

    const onTimeByGroup = new Map<string, { onTime: number; total: number }>();
    for (const s of shippedThisWeek) {
      if (s.onTime === null) continue;
      if (!onTimeByGroup.has(s.groupKey)) onTimeByGroup.set(s.groupKey, { onTime: 0, total: 0 });
      const g = onTimeByGroup.get(s.groupKey)!;
      g.total += 1;
      if (s.onTime) g.onTime += 1;
    }

    const topCustomers = customerGroups
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map(c => {
        const ot = onTimeByGroup.get(c.key);
        return {
          name: c.name,
          orders: c.orders,
          value: c.value,
          onTimePct: ot ? Math.round((ot.onTime / ot.total) * 100) : null,
        };
      });

    const manufacturingOverdueDays = stages.manufacturingDays !== null
      ? Math.max(0, stages.manufacturingDays - MANUFACTURING_LIMIT_DAYS)
      : null;

    const turnaroundDirection: 'faster' | 'slower' | 'flat' =
      core.avgCadTurnaroundMs === null || prevCore.avgCadTurnaroundMs === null
        ? 'flat'
        : core.avgCadTurnaroundMs > prevCore.avgCadTurnaroundMs * 1.02
        ? 'slower'
        : core.avgCadTurnaroundMs < prevCore.avgCadTurnaroundMs * 0.98
        ? 'faster'
        : 'flat';

    return {
      weekStart,
      weekEnd,
      ordersReceived: core.ordersReceived,
      ordersReceivedPctChange: pctChange(core.ordersReceived, prevCore.ordersReceived),
      cadsApproved: core.cadsApproved,
      cadsApprovedPctChange: pctChange(core.cadsApproved, prevCore.cadsApproved),
      cadsRevised: core.cadsRevised,
      cadsRevisedPctChange: pctChange(core.cadsRevised, prevCore.cadsRevised),
      avgCadTurnaroundMs: core.avgCadTurnaroundMs,
      avgCadTurnaroundDirection: turnaroundDirection,
      shippedOnTimePct,
      shippedOnTimeDeltaPts: shippedOnTimePct !== null && prevShippedOnTimePct !== null
        ? shippedOnTimePct - prevShippedOnTimePct
        : null,
      designers,
      stageDays: {
        cadDesign: stages.cadDesignDays,
        assignSupplier: stages.assignSupplierDays,
        manufacturing: stages.manufacturingDays,
        shipping: stages.shippingDays,
      },
      manufacturingLimitDays: MANUFACTURING_LIMIT_DAYS,
      manufacturingOverdueDays,
      slowestFactory: stages.slowestFactory,
      topCustomers,
      leadCustomerName: topCustomers[0]?.name || null,
      leadCustomerOrders: topCustomers[0]?.orders || null,
    };
  }

  private async computeCoreMetrics(start: Date, end: Date): Promise<CoreMetrics> {
    const [ordersReceived, cadsApproved, cadsRevised, approvedFiles] = await Promise.all([
      this.orderRepo.count({ where: { createdAt: Between(start, end) } }),
      this.cadRepo.count({ where: { status: CadFileStatus.APPROVED, approvedAt: Between(start, end) } }),
      this.cadRepo.count({ where: { status: CadFileStatus.REVISION_REQUESTED, updatedAt: Between(start, end) } }),
      this.cadRepo.find({ where: { status: CadFileStatus.APPROVED, approvedAt: Between(start, end) } }),
    ]);

    const turnarounds = approvedFiles
      .filter(f => f.approvedAt)
      .map(f => f.approvedAt!.getTime() - f.createdAt.getTime());

    return { ordersReceived, cadsApproved, cadsRevised, avgCadTurnaroundMs: avg(turnarounds) };
  }

  private async computeDesignerStats(start: Date, end: Date) {
    const files = await this.cadRepo
      .createQueryBuilder('c')
      .where('c."createdAt" BETWEEN :start AND :end', { start, end })
      .andWhere('(c."designerNotes" IS NULL OR c."designerNotes" NOT IN (:...tags))', {
        tags: Array.from(REFERENCE_NOTE_TAGS),
      })
      .getMany();
    if (!files.length) return [];

    const byUploader = new Map<string, CadFile[]>();
    for (const f of files) {
      const key = f.uploadedBy || 'unknown';
      if (!byUploader.has(key)) byUploader.set(key, []);
      byUploader.get(key)!.push(f);
    }

    const emails = Array.from(byUploader.keys());
    const users = await this.userRepo.find({ where: { email: In(emails) } });
    const userByEmail = new Map(users.map(u => [u.email, u]));

    return Array.from(byUploader.entries())
      .map(([email, list]) => {
        const user = userByEmail.get(email);
        const name = user ? `${user.firstName[0]}. ${user.lastName}` : email;
        const approved = list.filter(f => f.status === CadFileStatus.APPROVED).length;
        const turnarounds = list
          .filter(f => f.status === CadFileStatus.APPROVED && f.approvedAt)
          .map(f => f.approvedAt!.getTime() - f.createdAt.getTime());
        return {
          name,
          submitted: list.length,
          approved,
          avgTurnaroundMs: avg(turnarounds),
        };
      })
      .sort((a, b) => b.submitted - a.submitted);
  }

  // Fetches every STATUS_CHANGE / SUPPLIER_ASSIGNED event for the given orders
  // and keeps the first occurrence of each milestone — good enough for a
  // weekly snapshot; an order bounced back and re-processed would show its
  // original pass through the stage, not the latest one.
  private async getStageEventsForOrders(orderIds: string[]): Promise<Map<string, StageEventMap>> {
    const map = new Map<string, StageEventMap>();
    if (!orderIds.length) return map;
    const events = await this.eventRepo.find({ where: { orderId: In(orderIds) }, order: { createdAt: 'ASC' } });
    for (const ev of events) {
      if (!map.has(ev.orderId)) map.set(ev.orderId, {});
      const entry = map.get(ev.orderId)!;
      if (ev.action === 'STATUS_CHANGE') {
        if (ev.toStatus === OrderStatus.CAD_IN_PROGRESS && !entry.cadStart) entry.cadStart = ev.createdAt;
        if (ev.toStatus === OrderStatus.VPO_ISSUED && !entry.vpoIssued) entry.vpoIssued = ev.createdAt;
        if (ev.toStatus === OrderStatus.MANUFACTURED && !entry.manufactured) entry.manufactured = ev.createdAt;
      } else if (ev.action === 'SUPPLIER_ASSIGNED' && !entry.supplierAssigned) {
        entry.supplierAssigned = ev.createdAt;
      }
    }
    return map;
  }

  private async computeStageDurations(start: Date, end: Date) {
    const [vpoEvents, supplierEvents, manufacturedEvents] = await Promise.all([
      this.eventRepo.find({ where: { action: 'STATUS_CHANGE', toStatus: OrderStatus.VPO_ISSUED, createdAt: Between(start, end) } }),
      this.eventRepo.find({ where: { action: 'SUPPLIER_ASSIGNED', createdAt: Between(start, end) } }),
      this.eventRepo.find({ where: { action: 'STATUS_CHANGE', toStatus: OrderStatus.MANUFACTURED, createdAt: Between(start, end) } }),
    ]);

    const allOrderIds = Array.from(new Set([
      ...vpoEvents.map(e => e.orderId),
      ...supplierEvents.map(e => e.orderId),
      ...manufacturedEvents.map(e => e.orderId),
    ]));
    const stageMap = await this.getStageEventsForOrders(allOrderIds);

    const cadDesignDurations: number[] = [];
    for (const ev of vpoEvents) {
      const s = stageMap.get(ev.orderId);
      if (s?.cadStart) cadDesignDurations.push(ev.createdAt.getTime() - s.cadStart.getTime());
    }

    const assignSupplierDurations: number[] = [];
    for (const ev of supplierEvents) {
      const s = stageMap.get(ev.orderId);
      if (s?.vpoIssued) assignSupplierDurations.push(ev.createdAt.getTime() - s.vpoIssued.getTime());
    }

    const manufacturedOrderIds = manufacturedEvents.map(e => e.orderId);
    const manufacturedOrders = manufacturedOrderIds.length
      ? await this.orderRepo.find({ where: { id: In(manufacturedOrderIds) } })
      : [];
    const factoryById = new Map(manufacturedOrders.map(o => [o.id, o.assignedFactory]));

    const manufacturingDurations: number[] = [];
    const byFactory = new Map<string, number[]>();
    for (const ev of manufacturedEvents) {
      const s = stageMap.get(ev.orderId);
      const startTime = s?.supplierAssigned || s?.vpoIssued;
      if (!startTime) continue;
      const durationMs = ev.createdAt.getTime() - startTime.getTime();
      manufacturingDurations.push(durationMs);
      const factory = factoryById.get(ev.orderId);
      if (factory) {
        if (!byFactory.has(factory)) byFactory.set(factory, []);
        byFactory.get(factory)!.push(durationMs);
      }
    }

    // Shipping duration relies on the SHIPPED event now logged by
    // ShippingService.dispatch() — orders shipped before that existed simply
    // won't contribute a data point here rather than using a stale proxy.
    const shippedEvents = await this.eventRepo.find({
      where: { action: 'STATUS_CHANGE', toStatus: OrderStatus.SHIPPED, createdAt: Between(start, end) },
    });
    const shippingOrderIds = shippedEvents.map(e => e.orderId);
    const shippingStageMap = await this.getStageEventsForOrders(shippingOrderIds);
    const shippingDurations: number[] = [];
    for (const ev of shippedEvents) {
      const s = shippingStageMap.get(ev.orderId);
      if (s?.manufactured) shippingDurations.push(ev.createdAt.getTime() - s.manufactured.getTime());
    }

    let slowestFactory: { name: string; avgDays: number } | null = null;
    for (const [factory, durations] of byFactory) {
      const avgDays = msToDays(avg(durations))!;
      if (!slowestFactory || avgDays > slowestFactory.avgDays) slowestFactory = { name: factory, avgDays };
    }

    return {
      cadDesignDays: msToDays(avg(cadDesignDurations)),
      assignSupplierDays: msToDays(avg(assignSupplierDurations)),
      manufacturingDays: msToDays(avg(manufacturingDurations)),
      shippingDays: msToDays(avg(shippingDurations)),
      slowestFactory,
    };
  }

  private async getShippedRecords(start: Date, end: Date): Promise<ShippedRecord[]> {
    const shippedEvents = await this.eventRepo.find({
      where: { action: 'STATUS_CHANGE', toStatus: OrderStatus.SHIPPED, createdAt: Between(start, end) },
    });
    if (!shippedEvents.length) return [];
    const orderIds = shippedEvents.map(e => e.orderId);
    const orders = await this.orderRepo.find({ where: { id: In(orderIds) } });
    const byId = new Map(orders.map(o => [o.id, o]));

    const records: ShippedRecord[] = [];
    for (const ev of shippedEvents) {
      const o = byId.get(ev.orderId);
      if (!o) continue;
      const onTime = o.committedShipDate ? ev.createdAt <= new Date(`${o.committedShipDate}T23:59:59`) : null;
      records.push({
        orderId: o.id,
        onTime,
        groupKey: o.companyId || o.customerId || o.customerEmail || o.id,
        groupName: o.storeName || o.customerFullName || 'Unknown',
      });
    }
    return records;
  }

  private async computeCustomerGroups(start: Date, end: Date) {
    const orders = await this.orderRepo.find({ where: { createdAt: Between(start, end) } });
    const groups = new Map<string, { key: string; name: string; orders: number; value: number }>();
    for (const o of orders) {
      const key = o.companyId || o.customerId || o.customerEmail || o.id;
      const name = o.storeName || o.customerFullName || 'Unknown';
      if (!groups.has(key)) groups.set(key, { key, name, orders: 0, value: 0 });
      const g = groups.get(key)!;
      g.orders += 1;
      g.value += o.quotedCost ? Number(o.quotedCost) : 0;
    }
    return Array.from(groups.values());
  }
}
