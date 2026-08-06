import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, ILike, In, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { UserRole } from '../../database/entities/user.entity';
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

type ProductionPeriodType = 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';
const PRODUCTION_PERIOD_MONTHS: Record<ProductionPeriodType, number> = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };

interface CadAggregate { made: number; approved: number; rejected: number; revised: number }
interface RevisionEvent { customer: string; cadPersonName: string; completedAt: Date }

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(CadFile) private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(OrderEvent) private readonly eventRepo: Repository<OrderEvent>,
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

  async sendWeeklyReport(weekStart: Date, weekEnd: Date): Promise<void> {
    const stats = await this.getWeeklyStats(weekStart, weekEnd);
    const pdf = await buildWeeklyReportPdf(stats);

    const range = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    await this.emailService.send({
      to: REPORT_RECIPIENT,
      subject: `Weekly Operations Report — ${range}`,
      html: `<p style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#1A2740">The weekly operations report for ${range} is attached.</p>`,
      attachments: [{ filename: `weekly-report-${weekStart.toISOString().slice(0, 10)}.pdf`, content: pdf }],
      // The recipient may have general email notifications turned off (to stop
      // getting CC'd on every step) without meaning to lose this weekly report too.
      bypassOptOut: true,
    });
    this.logger.log(`Weekly operations report sent for ${range}`);
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

  // Confirmed manually (2026-07-31) — free-text "CAD Person" abbreviations
  // that are the same designer as a fuller name also seen in the data.
  // Keyed lowercase; only add an entry once the identity is verified, since
  // guessing wrong misattributes someone's work.
  private static readonly DESIGNER_ALIASES: Record<string, string> = {
    'sayali t.': 'Sayali Takke',
    'sg': 'Sayali Gawas',
    'hl': 'H. Lakhani',
    'sujit-jo': 'Sujit',
  };

  private async computeDesignerStats(start: Date, end: Date) {
    const files = await this.cadRepo
      .createQueryBuilder('c')
      .where('c."createdAt" BETWEEN :start AND :end', { start, end })
      .andWhere('(c."designerNotes" IS NULL OR c."designerNotes" NOT IN (:...tags))', {
        tags: Array.from(REFERENCE_NOTE_TAGS),
      })
      .getMany();
    if (!files.length) return [];

    // Grouped by cadPersonName (the free-text "CAD Person" field entered per
    // upload) rather than the uploadedBy account — several designers share
    // the same login (e.g. cad@kiradiam.com), so the account's own name
    // doesn't identify who actually did the work. Grouping key is
    // case/whitespace-normalized ("Manoj" vs "manoj" is one person), plus the
    // confirmed alias table above for abbreviation variants — anything not
    // in that table still shows as its own separate row rather than being
    // guessed at.
    const byDesigner = new Map<string, { nameCounts: Map<string, number>; files: CadFile[] }>();
    for (const f of files) {
      const raw = f.cadPersonName?.trim() || f.uploadedBy || 'Unknown';
      const resolved = ReportsService.DESIGNER_ALIASES[raw.toLowerCase()] || raw;
      const norm = resolved.toLowerCase();
      if (!byDesigner.has(norm)) byDesigner.set(norm, { nameCounts: new Map(), files: [] });
      const entry = byDesigner.get(norm)!;
      entry.files.push(f);
      entry.nameCounts.set(resolved, (entry.nameCounts.get(resolved) || 0) + 1);
    }

    return Array.from(byDesigner.values())
      .map(({ nameCounts, files: list }) => {
        const name = Array.from(nameCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
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

  // Diagnostic for the weekly report's per-designer table — one row per CAD
  // file with its actual createdAt/approvedAt and computed turnaround, so an
  // implausibly fast approval (seconds instead of hours/days) can be traced
  // back to the specific order/file instead of guessed at from an average.
  // Not used by the PDF — Admin-only, for investigating the numbers by hand.
  async getDesignerFilesDetail(weekStart: Date, weekEnd: Date) {
    const files = await this.cadRepo
      .createQueryBuilder('c')
      .where('c."createdAt" BETWEEN :start AND :end', { start: weekStart, end: weekEnd })
      .andWhere('(c."designerNotes" IS NULL OR c."designerNotes" NOT IN (:...tags))', {
        tags: Array.from(REFERENCE_NOTE_TAGS),
      })
      .getMany();

    const orderIds = Array.from(new Set(files.map(f => f.orderId)));
    const orders = orderIds.length ? await this.orderRepo.find({ where: { id: In(orderIds) } }) : [];
    const poByOrderId = new Map(orders.map(o => [o.id, o.poNumber]));

    return files
      .map(f => ({
        name: f.cadPersonName?.trim() || f.uploadedBy || 'Unknown',
        poNumber: poByOrderId.get(f.orderId) || f.orderId,
        status: f.status,
        createdAt: f.createdAt,
        approvedAt: f.approvedAt,
        approvedBy: f.approvedBy,
        turnaroundMs: f.approvedAt ? f.approvedAt.getTime() - f.createdAt.getTime() : null,
      }))
      .sort((a, b) => (a.turnaroundMs ?? Infinity) - (b.turnaroundMs ?? Infinity));
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

  // Global, cross-order view of order_events — the same rows the per-order
  // timeline (GET /orders/:id/events) already shows, just not scoped to one
  // order. poNumber isn't stored on the event row itself, so it's joined in
  // after the fact from a batch order lookup.
  async getAuditLog(filters: {
    userEmail?: string; action?: string; poNumber?: string; dateFrom?: string; dateTo?: string;
    limit?: number; offset?: number;
  }, caller?: { email: string; role: UserRole }): Promise<{ events: any[]; total: number }> {
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    const where: any = {};
    if (filters.action) where.action = filters.action;
    if (caller && caller.role !== UserRole.ADMIN) {
      // Non-admins can only ever see their own actions — the userEmail
      // filter is ignored for them rather than let it be used to page
      // through other users' entries.
      where.userEmail = caller.email;
    } else if (filters.userEmail) {
      where.userEmail = ILike(`%${filters.userEmail}%`);
    }
    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date('1970-01-01');
      const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : new Date();
      where.createdAt = Between(from, to);
    }

    if (filters.poNumber) {
      const matches = await this.orderRepo.find({ where: { poNumber: ILike(`%${filters.poNumber}%`) }, select: ['id'] });
      if (matches.length === 0) return { events: [], total: 0 };
      where.orderId = In(matches.map(o => o.id));
    }

    const [events, total] = await this.eventRepo.findAndCount({
      where, order: { createdAt: 'DESC' }, take: limit, skip: offset,
    });

    const orderIds = Array.from(new Set(events.map(e => e.orderId)));
    const orders = orderIds.length
      ? await this.orderRepo.find({ where: { id: In(orderIds) }, select: ['id', 'poNumber', 'storeName', 'customerFullName'] })
      : [];
    const orderById = new Map(orders.map(o => [o.id, o]));

    return {
      total,
      events: events.map(e => {
        const order = orderById.get(e.orderId);
        return { ...e, poNumber: order?.poNumber ?? null, storeName: order?.storeName ?? null, customerFullName: order?.customerFullName ?? null };
      }),
    };
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

  // ── Monthly Production Report ───────────────────────────────────────
  // Direct Orders Received, CADs Made, Samples Approved, Revisions Completed.
  // "Samples Approved" proxies CAD-file approval (no physical-sample stage
  // exists in the app). "Revisions Completed" is inferred: whenever a CAD
  // file sits at REVISION_REQUESTED and a later file is uploaded for the same
  // order, that later file's createdAt is treated as the revision's completion.
  // Neither is a directly-stored event — see the "inferred" flags in the response.

  async getMonthlyProductionReport(periodType: ProductionPeriodType, anchorMonth: string) {
    const months = PRODUCTION_PERIOD_MONTHS[periodType] || 1;
    const [y, m] = anchorMonth.split('-').map(Number);
    const to = new Date(y, m, 1); // exclusive — first day of the month after the anchor
    const from = new Date(y, m - months, 1);
    const prevTo = from;
    const prevFrom = new Date(y, m - months * 2, 1);

    // Revision-completion events are inferred from each order's full file history,
    // not just files created inside the window — compute once, then filter by date.
    const revisionEvents = await this.computeRevisionEvents();

    const current = await this.computeProductionWindow(from, to, periodType, revisionEvents);
    const previous = await this.computeProductionWindow(prevFrom, prevTo, periodType, revisionEvents);

    const pct = (cur: number, prev: number): number | null => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
    const lastDay = new Date(to.getTime() - DAY_MS);
    const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const label = from.getFullYear() === lastDay.getFullYear() && from.getMonth() === lastDay.getMonth()
      ? fmtMonth(from)
      : `${fmtMonth(from)} – ${fmtMonth(lastDay)}`;

    return {
      period: { type: periodType, from: from.toISOString().slice(0, 10), to: lastDay.toISOString().slice(0, 10), label },
      kpis: {
        directOrders:       { value: current.directTotal, deltaPct: pct(current.directTotal, previous.directTotal) },
        cadsMade:            { value: current.cadsTotal.made, deltaPct: pct(current.cadsTotal.made, previous.cadsTotal.made) },
        samplesApproved:     { value: current.samplesApprovedTotal, deltaPct: pct(current.samplesApprovedTotal, previous.samplesApprovedTotal), inferred: true },
        revisionsCompleted:  { value: current.revisionsCompletedTotal, deltaPct: pct(current.revisionsCompletedTotal, previous.revisionsCompletedTotal), inferred: true },
      },
      direct: current.direct,
      cads: current.cads,
      samples: current.samples,
      revisions: current.revisions,
    };
  }

  // Every non-reference CAD file, per order, oldest-first — used to detect a
  // "revision completed" event: a file uploaded right after that same order's
  // most recent file sat at REVISION_REQUESTED. Scoped to orders that have ever
  // had a REVISION_REQUESTED file, so this doesn't scan the whole cad_files table.
  private async computeRevisionEvents(): Promise<RevisionEvent[]> {
    const revisedOrderIds = await this.cadRepo.createQueryBuilder('cf')
      .select('DISTINCT cf.orderId', 'orderId')
      .where('cf.status = :rev', { rev: CadFileStatus.REVISION_REQUESTED })
      .getRawMany();
    const orderIds = revisedOrderIds.map((r: any) => r.orderId);
    if (!orderIds.length) return [];

    const files = await this.cadRepo.createQueryBuilder('cf')
      .leftJoin(Order, 'o', 'o.id = cf.orderId')
      .where('cf.orderId IN (:...ids)', { ids: orderIds })
      .andWhere('(cf.designerNotes IS NULL OR cf.designerNotes NOT IN (:...refs))', { refs: Array.from(REFERENCE_NOTE_TAGS) })
      .select(['cf.orderId AS "orderId"', 'cf.status AS status', 'cf.cadPersonName AS "cadPersonName"', 'cf.createdAt AS "createdAt"', 'o.storeName AS "storeName"', 'o.customerFullName AS "customerFullName"'])
      .orderBy('cf.orderId', 'ASC')
      .addOrderBy('cf.createdAt', 'ASC')
      .getRawMany();

    const byOrder = new Map<string, any[]>();
    for (const f of files) {
      if (!byOrder.has(f.orderId)) byOrder.set(f.orderId, []);
      byOrder.get(f.orderId)!.push(f);
    }

    const events: RevisionEvent[] = [];
    for (const rows of byOrder.values()) {
      for (let i = 0; i < rows.length - 1; i++) {
        if (rows[i].status === CadFileStatus.REVISION_REQUESTED) {
          const next = rows[i + 1];
          events.push({
            customer: next.storeName || next.customerFullName || 'Unknown',
            cadPersonName: next.cadPersonName || 'Unassigned',
            completedAt: new Date(next.createdAt),
          });
        }
      }
    }
    return events;
  }

  private bucketKey(date: Date, periodType: ProductionPeriodType): string {
    return periodType === 'monthly' ? date.toISOString().slice(0, 10) : date.toISOString().slice(0, 7);
  }

  private bucketRange(from: Date, to: Date, periodType: ProductionPeriodType): string[] {
    const keys: string[] = [];
    if (periodType === 'monthly') {
      for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        keys.push(d.toISOString().slice(0, 10));
      }
    } else {
      for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        keys.push(d.toISOString().slice(0, 7));
      }
    }
    return keys;
  }

  private emptyCadAgg(): CadAggregate { return { made: 0, approved: 0, rejected: 0, revised: 0 }; }

  private async computeProductionWindow(from: Date, to: Date, periodType: ProductionPeriodType, revisionEvents: RevisionEvent[]) {
    // ── Direct Orders Received — grouped by customer ──
    const directOrders = await this.orderRepo.createQueryBuilder('o')
      .where('o.salesRepName = :webOrder', { webOrder: 'Web Order' })
      .andWhere('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .andWhere('o.isArchived = false')
      .select(['o.poNumber AS "poNumber"', 'o.storeName AS "storeName"', 'o.customerFullName AS "customerFullName"'])
      .getRawMany();
    const directMap = new Map<string, string[]>();
    for (const o of directOrders) {
      const key = o.storeName || o.customerFullName || 'Unknown';
      if (!directMap.has(key)) directMap.set(key, []);
      directMap.get(key)!.push(o.poNumber);
    }
    const direct = {
      byCustomer: Array.from(directMap.entries())
        .map(([customer, poNumbers]) => ({ customer, orders: poNumbers.length, poNumbers }))
        .sort((a, b) => b.orders - a.orders),
    };
    const directTotal = directOrders.length;

    // ── CADs Made — every non-reference file created in the window, by current status ──
    const cadRows = await this.cadRepo.createQueryBuilder('cf')
      .leftJoin(Order, 'o', 'o.id = cf.orderId')
      .where('cf.createdAt >= :from AND cf.createdAt < :to', { from, to })
      .andWhere('(cf.designerNotes IS NULL OR cf.designerNotes NOT IN (:...refs))', { refs: Array.from(REFERENCE_NOTE_TAGS) })
      .select(['cf.status AS status', 'cf.cadPersonName AS "cadPersonName"', 'cf.createdAt AS "createdAt"', 'o.storeName AS "storeName"', 'o.customerFullName AS "customerFullName"'])
      .getRawMany();

    const byPersonMap = new Map<string, CadAggregate>();
    const byCustomerMap = new Map<string, CadAggregate>();
    const byTimeMap = new Map<string, CadAggregate>();
    const bump = (map: Map<string, CadAggregate>, key: string, status: string) => {
      if (!map.has(key)) map.set(key, this.emptyCadAgg());
      const agg = map.get(key)!;
      agg.made += 1;
      if (status === CadFileStatus.APPROVED) agg.approved += 1;
      else if (status === CadFileStatus.REJECTED) agg.rejected += 1;
      else if (status === CadFileStatus.REVISION_REQUESTED) agg.revised += 1;
    };
    for (const r of cadRows) {
      bump(byPersonMap, r.cadPersonName || 'Unassigned', r.status);
      bump(byCustomerMap, r.storeName || r.customerFullName || 'Unknown', r.status);
      bump(byTimeMap, this.bucketKey(new Date(r.createdAt), periodType), r.status);
    }
    const cadsTotal = cadRows.reduce((acc, r) => {
      acc.made += 1;
      if (r.status === CadFileStatus.APPROVED) acc.approved += 1;
      else if (r.status === CadFileStatus.REJECTED) acc.rejected += 1;
      else if (r.status === CadFileStatus.REVISION_REQUESTED) acc.revised += 1;
      return acc;
    }, this.emptyCadAgg());
    const sortedAgg = (m: Map<string, CadAggregate>) => Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.made - a.made);
    const cads = {
      byPerson: sortedAgg(byPersonMap),
      byCustomer: sortedAgg(byCustomerMap),
      byTime: this.bucketRange(from, to, periodType).map(bucket => ({ bucket, ...(byTimeMap.get(bucket) || this.emptyCadAgg()) })),
    };

    // ── Samples Approved — CAD files approved in the window (event-based, proxy metric) ──
    const approvedRows = await this.cadRepo.createQueryBuilder('cf')
      .leftJoin(Order, 'o', 'o.id = cf.orderId')
      .where('cf.status = :approved', { approved: CadFileStatus.APPROVED })
      .andWhere('cf.approvedAt >= :from AND cf.approvedAt < :to', { from, to })
      .andWhere('(cf.designerNotes IS NULL OR cf.designerNotes NOT IN (:...refs))', { refs: Array.from(REFERENCE_NOTE_TAGS) })
      .select(['cf.cadPersonName AS "cadPersonName"', 'cf.approvedAt AS "approvedAt"', 'o.storeName AS "storeName"', 'o.customerFullName AS "customerFullName"'])
      .getRawMany();
    const uploadedByPerson = new Map<string, number>();
    for (const r of cadRows) uploadedByPerson.set(r.cadPersonName || 'Unassigned', (uploadedByPerson.get(r.cadPersonName || 'Unassigned') || 0) + 1);
    const samplesByPerson = new Map<string, number>();
    const samplesByCustomer = new Map<string, number>();
    const samplesByTime = new Map<string, number>();
    for (const r of approvedRows) {
      const person = r.cadPersonName || 'Unassigned';
      const customer = r.storeName || r.customerFullName || 'Unknown';
      samplesByPerson.set(person, (samplesByPerson.get(person) || 0) + 1);
      samplesByCustomer.set(customer, (samplesByCustomer.get(customer) || 0) + 1);
      const bucket = this.bucketKey(new Date(r.approvedAt), periodType);
      samplesByTime.set(bucket, (samplesByTime.get(bucket) || 0) + 1);
    }
    const samples = {
      byPerson: Array.from(samplesByPerson.entries()).map(([name, approved]) => ({ name, uploaded: uploadedByPerson.get(name) || 0, approved })).sort((a, b) => b.approved - a.approved),
      byCustomer: Array.from(samplesByCustomer.entries()).map(([name, approved]) => ({ name, approved })).sort((a, b) => b.approved - a.approved),
      byTime: this.bucketRange(from, to, periodType).map(bucket => ({ bucket, approved: samplesByTime.get(bucket) || 0 })),
    };
    const samplesApprovedTotal = approvedRows.length;

    // ── Revisions Completed — pre-computed events, filtered to this window ──
    const windowRevisions = revisionEvents.filter(e => e.completedAt >= from && e.completedAt < to);
    const revisionsByPerson = new Map<string, number>();
    const revisionsByCustomer = new Map<string, number>();
    const revisionsByTime = new Map<string, number>();
    for (const e of windowRevisions) {
      revisionsByPerson.set(e.cadPersonName, (revisionsByPerson.get(e.cadPersonName) || 0) + 1);
      revisionsByCustomer.set(e.customer, (revisionsByCustomer.get(e.customer) || 0) + 1);
      const bucket = this.bucketKey(e.completedAt, periodType);
      revisionsByTime.set(bucket, (revisionsByTime.get(bucket) || 0) + 1);
    }
    const revisions = {
      byPerson: Array.from(revisionsByPerson.entries()).map(([name, revised]) => ({ name, uploaded: uploadedByPerson.get(name) || 0, revised })).sort((a, b) => b.revised - a.revised),
      byCustomer: Array.from(revisionsByCustomer.entries()).map(([name, revised]) => ({ name, revised })).sort((a, b) => b.revised - a.revised),
      byTime: this.bucketRange(from, to, periodType).map(bucket => ({ bucket, revised: revisionsByTime.get(bucket) || 0 })),
    };
    const revisionsCompletedTotal = windowRevisions.length;

    return { directTotal, direct, cadsTotal, cads, samplesApprovedTotal, samples, revisionsCompletedTotal, revisions };
  }
}
