import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { EmailService } from '../email/email.service';
import { SmartsheetImportService } from './smartsheet-import.service';
import { mapSmartsheetStatus, FIELD_MAP } from './smartsheet-constants';

@Injectable()
export class SmartsheetWebhookService {
  private readonly logger = new Logger(SmartsheetWebhookService.name);
  private readonly base = 'https://api.smartsheet.com/2.0';

  private colCache: Record<string, number> | null = null;
  private colCacheAt = 0;
  private readonly COL_CACHE_TTL = 10 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
    private readonly importService: SmartsheetImportService,
  ) {}

  private get token()   { return this.config.get('SMARTSHEET_API_TOKEN', ''); }
  private get sheetId() { return this.config.get('SMARTSHEET_SHEET_ID', ''); }

  private async smFetch(path: string, opts: RequestInit = {}): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(opts.headers as any),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Smartsheet ${opts.method || 'GET'} ${path} → ${res.status}: ${text}`);
    }
    return res.json();
  }

  private async getColMap(): Promise<Record<string, number>> {
    if (this.colCache && Date.now() - this.colCacheAt < this.COL_CACHE_TTL) return this.colCache!;
    const sheet = await this.smFetch(`/sheets/${this.sheetId}`);
    const map: Record<string, number> = {};
    (sheet.columns || []).forEach((c: any) => { map[c.title] = c.id; });
    this.colCache = map;
    this.colCacheAt = Date.now();
    return map;
  }

  // ── Register a Smartsheet webhook (one-time setup) ────────────────────────
  async registerWebhook(): Promise<{ webhookId: number; callbackUrl: string; status: string }> {
    const backendUrl = this.config.get('BACKEND_PUBLIC_URL', '');
    if (!backendUrl || backendUrl.includes('localhost')) {
      throw new Error('BACKEND_PUBLIC_URL must be set to a public URL before registering a webhook.');
    }
    const callbackUrl = `${backendUrl}/api/v1/smartsheet/webhook/callback`;

    const data = await this.smFetch('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name: 'JewelFlow Live Sync',
        callbackUrl,
        scope: 'sheet',
        scopeObjectId: Number(this.sheetId),
        events: ['*.*'],
        version: 1,
      }),
    });

    const webhookId = data.result?.id;
    if (webhookId) {
      await this.smFetch(`/webhooks/${webhookId}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      });
    }

    this.logger.log(`Webhook registered: id=${webhookId} → ${callbackUrl}`);
    return { webhookId, callbackUrl, status: data.result?.status || 'REGISTERED' };
  }

  async listWebhooks(): Promise<any> {
    return this.smFetch('/webhooks');
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.smFetch(`/webhooks/${webhookId}`, { method: 'DELETE' });
    this.logger.log(`Webhook ${webhookId} deleted`);
  }

  // ── Handle incoming Smartsheet webhook events ─────────────────────────────
  async processWebhookEvent(payload: any): Promise<{ created: number; updated: number; skipped: number }> {
    const result = { created: 0, updated: 0, skipped: 0 };
    const events: any[] = payload.events || [];

    // Separate new rows (form submissions) from row updates (staff edits)
    const createdIds = [...new Set(
      events.filter(e => e.objectType === 'row' && e.eventType === 'created').map(e => String(e.id)),
    )];
    // Row field changes
    const updatedRowIds = events
      .filter(e => e.objectType === 'row' && e.eventType === 'updated')
      .map(e => String(e.id));

    // Comment or attachment added to a row → find the parent row ID
    const mediaRowIds = events
      .filter(e => ['discussion', 'attachment'].includes(e.objectType) && e.parentType === 'ROW')
      .map(e => String(e.parentId));

    const updatedIds = [...new Set([...updatedRowIds, ...mediaRowIds])].filter(id => !createdIds.includes(id));

    this.logger.log(`Webhook: ${createdIds.length} new rows, ${updatedIds.length} updated rows`);

    // ── New rows → create portal orders ──────────────────────────────────
    // Only import rows created today — old rows get updated frequently, ignore them entirely
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const freshCreatedIds: string[] = [];
    for (const rowId of createdIds) {
      try {
        const row = await this.smFetch(`/sheets/${this.sheetId}/rows/${rowId}`);
        const rowDate = row.createdAt ? new Date(row.createdAt) : null;
        if (rowDate && rowDate >= startOfToday) {
          freshCreatedIds.push(rowId);
        } else {
          this.logger.debug(`Skipping row ${rowId} (created ${row.createdAt}) — not today`);
          result.skipped++;
        }
      } catch { result.skipped++; }
    }

    if (freshCreatedIds.length) {
      const summary = await this.importService.importByRowIds(this.sheetId, freshCreatedIds);

      result.created = summary.ordersCreated;
      result.skipped += summary.ordersSkipped;

      if (summary.ordersCreated > 0) {
        const newPos = summary.orders.filter(o => o.action === 'created').map(o => o.po);
        const newOrders = await this.orderRepo.find({ where: { poNumber: In(newPos) } });
        for (const order of newOrders) {
          await this.notifyAuthorizers(order).catch(err =>
            this.logger.warn(`Notify failed for ${order.poNumber}: ${err.message}`),
          );
        }
      }
    }

    // ── Updated rows → sync existing orders ──────────────────────────────
    for (const rowId of updatedIds) {
      try {
        const synced = await this.syncRow(rowId);
        if (synced) result.updated++; else result.skipped++;
      } catch (e: any) {
        this.logger.warn(`Sync row ${rowId} failed: ${e.message}`);
        result.skipped++;
      }
    }

    return result;
  }

  // ── Notify authorizers of a new order ────────────────────────────────────
  private async notifyAuthorizers(order: Order): Promise<void> {
    const staff = await this.userRepo.find({
      where: [{ role: UserRole.AUTHORIZER }, { role: UserRole.ADMIN }],
    });

    await Promise.all(staff.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type:         NotificationType.ORDER_CREATED,
        title:        `New Smartsheet Order — ${order.poNumber}`,
        message:      `New order from ${order.storeName || order.customerFullName || 'a customer'} via Smartsheet form.`,
        orderId:      order.id,
        targetUserId: u.id,
      })),
    ));

    const authEmails = staff
      .filter(u => u.role === UserRole.AUTHORIZER)
      .map(u => u.email)
      .filter(Boolean);

    if (authEmails.length) {
      this.emailService.sendNewOrderToAuthorizers({
        to:           authEmails,
        poNumber:     order.poNumber,
        customerName: order.customerFullName || order.storeName || 'Customer',
        orderType:    order.orderType || 'Custom Order',
        storeName:    order.storeName || 'Smartsheet Form',
        orderId:      order.id,
      }).catch(err => this.logger.warn(`Auth email failed for ${order.poNumber}: ${err.message}`));
    }
  }

  // ── Sync a single updated row to its existing portal order ───────────────
  private async syncRow(rowId: string): Promise<boolean> {
    const [rowData, colMap] = await Promise.all([
      this.smFetch(`/sheets/${this.sheetId}/rows/${rowId}`),
      this.getColMap(),
    ]);

    const getCell = (title: string): string | null => {
      const colId = colMap[title];
      if (colId === undefined) return null;
      const cell = (rowData.cells || []).find((c: any) => c.columnId === colId);
      return cell?.displayValue ?? cell?.value ?? null;
    };

    const smartsheetPo = getCell('PO #') || '';

    let order = await this.orderRepo.findOne({ where: { smartsheetRowId: rowId } });
    if (!order && smartsheetPo) {
      order = await this.orderRepo.findOne({ where: { refCustomerPo: smartsheetPo } });
    }
    if (!order) {
      this.logger.debug(`No order found for rowId=${rowId} po=${smartsheetPo}`);
      return false;
    }

    const updates: Partial<Order> = { smartsheetRowId: rowId };

    for (const [colTitle, field] of FIELD_MAP) {
      const val = getCell(colTitle);
      if (val !== null && val !== '') (updates as any)[field] = val;
    }

    const costRaw = getCell('Kira Quoted Cost') || getCell('Cost');
    if (costRaw) {
      const n = parseFloat(String(costRaw).replace(/[$,\s]/g, ''));
      if (!isNaN(n)) updates.quotedCost = n;
    }

    await this.orderRepo.update(order.id, updates);

    // Sync any new attachments and comments from Smartsheet
    const media = await this.importService.syncRowMedia(this.sheetId, rowId, order.id);
    this.logger.log(`Synced ${order.poNumber} ← rowId ${rowId}${media.attachmentsAdded || media.commentsAdded ? ` (+${media.attachmentsAdded} files, +${media.commentsAdded} comments)` : ''}`);
    return true;
  }

  // ── Manual full-sheet sync ────────────────────────────────────────────────
  async syncAll(from?: string, to?: string): Promise<{ synced: number; skipped: number; unmapped: string[]; errors: string[] }> {
    const result = { synced: 0, skipped: 0, unmapped: [] as string[], errors: [] as string[] };
    const sheet = await this.smFetch(`/sheets/${this.sheetId}`);
    const colMap: Record<string, number> = {};
    (sheet.columns || []).forEach((c: any) => { colMap[c.title] = c.id; });
    this.colCache = colMap;
    this.colCacheAt = Date.now();

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? (() => { const d = new Date(to); d.setHours(23, 59, 59, 999); return d; })() : null;
    const rows: any[] = (sheet.rows || []).filter((r: any) => {
      if (!fromDate && !toDate) return true;
      const d = new Date(r.createdAt);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });

    this.logger.log(`Full sync — ${rows.length} rows to process`);

    for (const row of rows) {
      try {
        const getCell = (title: string): string | null => {
          const colId = colMap[title];
          if (colId === undefined) return null;
          const cell = row.cells?.find((c: any) => c.columnId === colId);
          return cell?.displayValue ?? cell?.value ?? null;
        };
        const smartsheetPo = getCell('PO #') || '';
        let order = await this.orderRepo.findOne({ where: { smartsheetRowId: String(row.id) } });
        if (!order && smartsheetPo) order = await this.orderRepo.findOne({ where: { refCustomerPo: smartsheetPo } });
        if (!order) { result.skipped++; continue; }

        const updates: Partial<Order> = { smartsheetRowId: String(row.id) };
        for (const [colTitle, field] of FIELD_MAP) { const val = getCell(colTitle); if (val !== null && val !== '') (updates as any)[field] = val; }
        const costRaw = getCell('Kira Quoted Cost') || getCell('Cost');
        if (costRaw) { const n = parseFloat(String(costRaw).replace(/[$,\s]/g, '')); if (!isNaN(n)) updates.quotedCost = n; }

        await this.orderRepo.update(order.id, updates);
        result.synced++;
      } catch (e: any) { result.errors.push(`Row ${row.id}: ${e.message}`); }
    }

    this.logger.log(`Full sync — synced:${result.synced} skipped:${result.skipped}`);
    return result;
  }
}
