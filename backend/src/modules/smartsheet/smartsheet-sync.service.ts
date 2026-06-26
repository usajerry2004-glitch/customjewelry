import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
export class SmartsheetSyncService {
  private readonly logger = new Logger(SmartsheetSyncService.name);
  private readonly base = 'https://api.smartsheet.com/2.0';
  private running = false;
  private runningUpdates = false;
  private runningCadMedia = false;
  private lastUpdatePollAt = new Date(0); // epoch = sync everything on first run

  constructor(
    private readonly config: ConfigService,
    private readonly importService: SmartsheetImportService,
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
  ) {}

  private get sheetId() { return this.config.get('SMARTSHEET_SHEET_ID', ''); }
  private get token()   { return this.config.get('SMARTSHEET_API_TOKEN', ''); }

  private async smGet(path: string): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Smartsheet ${path} → ${res.status}`);
    return res.json();
  }

  // Runs every 5 minutes — catches new form submissions the webhook missed.
  @Cron('*/5 * * * *')
  async poll() {
    if (this.running) return;
    this.running = true;
    try {
      // Only look at rows created today — old rows get updated frequently, ignore them
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const sheet = await this.smGet(`/sheets/${this.sheetId}`);

      const recentRows: any[] = (sheet.rows || []).filter((r: any) => {
        const d = r.createdAt ? new Date(r.createdAt) : null;
        return d && d >= startOfToday;
      });

      if (!recentRows.length) {
        this.logger.debug('Smartsheet poll: no recent rows');
        return;
      }

      // Only import rows not already in the portal DB
      const newRowIds: string[] = [];
      for (const row of recentRows) {
        const rowId = String(row.id);
        const exists = await this.orderRepo.findOne({ where: { smartsheetRowId: rowId } });
        if (!exists) newRowIds.push(rowId);
      }

      if (!newRowIds.length) {
        this.logger.debug('Smartsheet poll: all recent rows already imported');
        return;
      }

      this.logger.log(`Smartsheet poll: importing ${newRowIds.length} missed row(s)`);
      const summary = await this.importService.importByRowIds(this.sheetId, newRowIds);

      if (summary.ordersCreated > 0) {
        const newPos = summary.orders.filter(o => o.action === 'created').map(o => o.po);
        const newOrders = await this.orderRepo.find({ where: { poNumber: In(newPos) } });
        for (const order of newOrders) {
          await this.notifyAuthorizers(order).catch(err =>
            this.logger.warn(`Notify failed for ${order.poNumber}: ${err.message}`),
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Smartsheet poll failed: ${err.message}`);
    } finally {
      this.running = false;
    }
  }

  // Runs every 5 minutes — syncs status, images, and comments for existing portal orders.
  @Cron('*/5 * * * *')
  async pollUpdates() {
    if (this.runningUpdates) return;
    this.runningUpdates = true;
    try {
      const since = this.lastUpdatePollAt;
      this.lastUpdatePollAt = new Date();

      const sheet = await this.smGet(`/sheets/${this.sheetId}`);
      const colMap: Record<string, number> = {};
      (sheet.columns || []).forEach((c: any) => { colMap[c.title] = c.id; });

      let synced = 0;
      for (const row of (sheet.rows || [])) {
        const modifiedAt = row.modifiedAt ? new Date(row.modifiedAt) : null;
        if (!modifiedAt || modifiedAt <= since) continue;

        const rowId = String(row.id);
        const getCell = (title: string): string | null => {
          const colId = colMap[title];
          if (colId === undefined) return null;
          const cell = (row.cells || []).find((c: any) => c.columnId === colId);
          return cell?.displayValue ?? cell?.value ?? null;
        };

        const smartsheetPo = getCell('PO #') || '';
        let order = await this.orderRepo.findOne({ where: { smartsheetRowId: rowId } });
        if (!order && smartsheetPo) {
          order = await this.orderRepo.findOne({ where: { refCustomerPo: smartsheetPo } });
        }
        if (!order) continue;

        const updates: Partial<Order> = { smartsheetRowId: rowId };
        const rawStatus = (getCell('Status') || '').trim();
        const newStatus = mapSmartsheetStatus(rawStatus);
        if (newStatus) updates.status = newStatus;

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
        const media = await this.importService.syncRowMedia(this.sheetId, rowId, order.id);
        this.logger.log(
          `pollUpdates: ${order.poNumber}${newStatus ? ` → ${newStatus}` : ''}` +
          `${media.attachmentsAdded || media.commentsAdded ? ` (+${media.attachmentsAdded} files, +${media.commentsAdded} msgs)` : ''}`,
        );
        synced++;
      }

      if (synced) this.logger.log(`pollUpdates: synced ${synced} order(s)`);
      else this.logger.debug('pollUpdates: no changes since last poll');
    } catch (err: any) {
      this.logger.error(`pollUpdates failed: ${err.message}`);
    } finally {
      this.runningUpdates = false;
    }
  }

  // Runs every 10 minutes — syncs attachments + comments for orders in CAD_IN_PROGRESS.
  // pollUpdates only fires on cell changes (Smartsheet modifiedAt); attachments and
  // discussions don't update modifiedAt, so this cron catches those separately.
  @Cron('*/10 * * * *')
  async pollCadMedia() {
    if (this.runningCadMedia) return;
    this.runningCadMedia = true;
    try {
      const activeOrders = await this.orderRepo.find({
        where: { status: OrderStatus.CAD_IN_PROGRESS },
        select: ['id', 'smartsheetRowId', 'poNumber'] as any,
      });

      let synced = 0;
      for (const order of activeOrders) {
        if (!order.smartsheetRowId) continue;
        const media = await this.importService.syncRowMedia(this.sheetId, order.smartsheetRowId, order.id);
        if (media.attachmentsAdded || media.commentsAdded) {
          this.logger.log(`pollCadMedia: ${order.poNumber} +${media.attachmentsAdded} files, +${media.commentsAdded} msgs`);
          synced++;
        }
      }
      if (synced) this.logger.log(`pollCadMedia: synced media for ${synced} order(s)`);
      else this.logger.debug('pollCadMedia: no new media');
    } catch (err: any) {
      this.logger.error(`pollCadMedia failed: ${err.message}`);
    } finally {
      this.runningCadMedia = false;
    }
  }

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
}
