import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { writeFileSync } from 'fs';
import * as bcrypt from 'bcryptjs';
import { Order, OrderStatus, ManufacturingPath } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { OrderMessage } from '../../database/entities/order-message.entity';

import { mapSmartsheetStatus } from './smartsheet-constants';

export interface ImportSummary {
  ordersCreated: number;
  ordersUpdated: number;
  ordersSkipped: number;
  customersCreated: number;
  attachmentsImported: number;
  commentsImported: number;
  errors: string[];
  orders: { po: string; smartsheetPo: string; status: string; customer: string; action: 'created' | 'updated' }[];
}

@Injectable()
export class SmartsheetImportService {
  private readonly logger = new Logger(SmartsheetImportService.name);
  private readonly base = 'https://api.smartsheet.com/2.0';

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(CadFile)      private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(OrderMessage) private readonly msgRepo: Repository<OrderMessage>,
  ) {}

  private get token(): string {
    return this.config.get('SMARTSHEET_API_TOKEN', '');
  }

  private async smGet(path: string): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Smartsheet ${path} → ${res.status}`);
    return res.json();
  }

  // ── Parse "$1,500.00" → 1500 ──────────────────────────────────────────
  private parseCost(v: any): number | undefined {
    if (!v) return undefined;
    const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isNaN(n) ? undefined : n;
  }

  // ── Auto-generate next CO##### PO number ─────────────────────────────
  private async nextPo(): Promise<string> {
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.poNumber')
      .where("o.poNumber LIKE 'CO%' OR o.poNumber LIKE '%(CO%'")
      .getMany();
    let maxSeq = 10612;
    for (const row of rows) {
      const po = row.poNumber;
      const m1 = po.match(/^CO(\d+)$/);
      if (m1) maxSeq = Math.max(maxSeq, parseInt(m1[1], 10));
      const m2 = po.match(/\(CO(\d+)\)/);
      if (m2) maxSeq = Math.max(maxSeq, parseInt(m2[1], 10));
    }
    return `CO${String(maxSeq + 1).padStart(5, '0')}`;
  }

  // ── Find or create customer ───────────────────────────────────────────
  private async findOrCreateCustomer(
    email: string,
    storeName: string,
    fullName: string,
  ): Promise<{ user: User; created: boolean }> {
    if (email) {
      const existing = await this.userRepo.findOne({ where: { email: email.toLowerCase().trim() } });
      if (existing) return { user: existing, created: false };
    }

    const [firstName, ...rest] = (fullName || storeName || 'Import Customer').trim().split(' ');
    const lastName = rest.join(' ') || '—';
    const finalEmail = email?.toLowerCase().trim() || `import-${Date.now()}@smartsheet.import`;

    const passwordHash = await bcrypt.hash('Kira@Import2026!', 10);
    const user = this.userRepo.create({
      firstName: firstName || 'Customer',
      lastName,
      email: finalEmail,
      passwordHash,
      role: UserRole.CUSTOMER,
      storeName: storeName || undefined,
      isActive: true,
    });
    return { user: await this.userRepo.save(user), created: true };
  }

  // ── Download Smartsheet attachment and save to disk ───────────────────
  private async downloadAttachment(sheetId: string, attachmentId: number | string): Promise<{ fileName: string; originalName: string; mimeType: string } | null> {
    try {
      const meta = await this.smGet(`/sheets/${sheetId}/attachments/${attachmentId}`);
      const url: string = meta.url;
      const originalName: string = meta.name || 'attachment';
      const mimeType: string = meta.mimeType || 'application/octet-stream';

      const res = await fetch(url);
      if (!res.ok) return null;

      const buffer = Buffer.from(await res.arrayBuffer());
      const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
      const fileName = `${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
      writeFileSync(join(process.cwd(), 'uploads', 'cad', fileName), buffer);

      return { fileName, originalName, mimeType };
    } catch (e) {
      this.logger.warn(`Attachment ${attachmentId} download failed: ${e.message}`);
      return null;
    }
  }

  // ── Import specific row IDs (bypasses date filter — for rows the bulk fetch misses) ──
  async importByRowIds(sheetId: string, rowIds: string[]): Promise<ImportSummary> {
    const summary: ImportSummary = {
      ordersCreated: 0, ordersUpdated: 0, ordersSkipped: 0, customersCreated: 0,
      attachmentsImported: 0, commentsImported: 0, errors: [], orders: [],
    };
    // Fetch column map from base sheet
    const baseSheet = await this.smGet(`/sheets/${sheetId}`);
    const colMap: Record<string, number> = {};
    baseSheet.columns.forEach((c: any) => { colMap[c.title] = c.id; });
    const getCell = (row: any, title: string): string | null => {
      const colId = colMap[title];
      if (!colId) return null;
      const cell = row.cells?.find((c: any) => c.columnId === colId);
      return cell?.displayValue ?? cell?.value ?? null;
    };
    const systemUser = await this.userRepo.findOne({ where: { role: UserRole.ADMIN } });
    for (const rowId of rowIds) {
      try {
        const row = await this.smGet(`/sheets/${sheetId}/rows/${rowId}?include=attachments,discussions`);
        await this.processRow(sheetId, row, getCell, systemUser, summary);
      } catch (err) {
        summary.errors.push(`Row ${rowId}: ${err.message}`);
      }
    }
    return summary;
  }

  // ── Shared row processing (used by both bulk import and importByRowIds) ──
  private async processRow(sheetId: string, row: any, getCell: (row: any, title: string) => string | null, systemUser: any, summary: ImportSummary): Promise<void> {
    const smartsheetPo = getCell(row, 'PO #') || '';
    const email      = getCell(row, 'Email (final)') || getCell(row, 'Email') || '';
    const storeName  = getCell(row, 'Store Name') || '';
    const fullName   = getCell(row, 'Customer Full Name') || getCell(row, 'Customer Name') || '';
    const rawStatus  = (getCell(row, 'Status') || '').trim();
    const status     = mapSmartsheetStatus(rawStatus) ?? OrderStatus.CAD_IN_PROGRESS;

    const exists = await this.orderRepo.findOne({ where: { refCustomerPo: smartsheetPo } });
    if (exists && smartsheetPo) {
      const dataUpdate: Partial<Order> = {
        ...(getCell(row, 'Kira Sku #')                                           ? { kiraSkuNumber:   getCell(row, 'Kira Sku #')! }                                           : {}),
        ...(getCell(row, 'Tracking') || getCell(row, 'Tracking #')               ? { trackingNumber:  getCell(row, 'Tracking') || getCell(row, 'Tracking #')! }              : {}),
        ...(this.parseCost(getCell(row, 'Kira Quoted Cost') || getCell(row, 'Cost')) != null ? { quotedCost: this.parseCost(getCell(row, 'Kira Quoted Cost') || getCell(row, 'Cost'))! } : {}),
        smartsheetRowId: String(row.id),
      };
      if (Object.keys(dataUpdate).length > 0) await this.orderRepo.update(exists.id, dataUpdate);
      summary.ordersUpdated++;
      summary.orders.push({ po: exists.poNumber, smartsheetPo, status: rawStatus, customer: storeName || fullName, action: 'updated' });
      return;
    }

    const { user: customer, created } = await this.findOrCreateCustomer(email, storeName, fullName);
    if (created) summary.customersCreated++;
    // If the Smartsheet PO is already in our CO##### / CO-##### / CR#### format, use it directly
    const ssPoIsNative = smartsheetPo && /^(CO-?\d+|CR\d+)$/i.test(smartsheetPo);
    const poWithRef = ssPoIsNative ? smartsheetPo : (smartsheetPo ? `${await this.nextPo()} (${smartsheetPo})` : await this.nextPo());
    const orderData: Partial<Order> = {
      poNumber: poWithRef, refCustomerPo: smartsheetPo || undefined,
      smartsheetRowId: String(row.id), status, manufacturingPath: ManufacturingPath.STANDARD,
      customerId: customer.id, customerEmail: customer.email,
      customerFullName: fullName || `${customer.firstName} ${customer.lastName}`,
      storeName: storeName || customer.storeName,
      kiraSkuNumber: getCell(row, 'Kira Sku #') || undefined,
      orderType: getCell(row, 'Type') || undefined,
      size: getCell(row, 'Size') || getCell(row, 'Ring Size or Bracelet Length') || undefined,
      metalType: getCell(row, 'Metal Type') || undefined, metalColor: getCell(row, 'Metal Color') || undefined,
      diamondType: getCell(row, 'Natural or Lab') || undefined,
      diamondQuality: getCell(row, 'Dia Quality') || getCell(row, 'Diamond Quality') || undefined,
      centerStoneShape: getCell(row, 'Center Stone Shape') || undefined,
      approximateCaratWeight: getCell(row, 'Approximate Carat Weight') || undefined,
      centerStoneRatio: getCell(row, 'Center Stone Ratio') || undefined,
      quotedCost: this.parseCost(getCell(row, 'Kira Quoted Cost') || getCell(row, 'Cost')) ?? undefined,
      invoiceNumber: getCell(row, 'Invoice #') || undefined, shipMethod: getCell(row, 'Ship Method') || undefined,
      vendorName: getCell(row, 'Vendor Name') || undefined,
      trackingNumber: getCell(row, 'Tracking') || getCell(row, 'Tracking #') || undefined,
      rcOrderNumber: getCell(row, 'RC Order #') || undefined, rcJobBagNumber: getCell(row, 'RC Job Bag #') || undefined,
      rcVpoNumber: getCell(row, 'RC VPO #') || undefined, vpoOrderDetails: getCell(row, 'VPO order details') || undefined,
      factoryStatus: getCell(row, 'Factory Status') || undefined,
      referenceWeblink: getCell(row, 'Reference Weblink') || getCell(row, 'Upload Reference Link') || undefined,
      phoneNumber: getCell(row, 'Phone Number') || undefined, headStyle: getCell(row, 'Head Style') || undefined,
      shankStyle: getCell(row, 'Shank Style') || undefined, timeFrame: getCell(row, 'Time Frame') || undefined,
      stockNumber: getCell(row, 'Stock No# (If from Inventory)') || undefined,
      salesRepEmail: getCell(row, 'Sales Rep Email') || undefined,
      salesRepName: getCell(row, 'Sales Rep Email') || undefined,
      customerNotes: getCell(row, 'Customer Comments') || getCell(row, 'Additional Comments') || undefined,
      internalNotes: getCell(row, 'Kira Status Comments') || undefined,
      isPriorityCustomer: customer.isPriority,
    };
    const order = await this.orderRepo.save(this.orderRepo.create(orderData));
    if (row.createdAt) {
      await this.orderRepo.query(`UPDATE orders SET "createdAt" = $1 WHERE id = $2`, [new Date(row.createdAt), order.id]);
    }
    summary.ordersCreated++;
    summary.orders.push({ po: poWithRef, smartsheetPo, status: rawStatus, customer: storeName || fullName, action: 'created' });

    const attachments: any[] = row.attachments || [];
    let cadFilesImported = 0;
    for (const att of attachments) {
      const dl = await this.downloadAttachment(sheetId, att.id);
      if (!dl) continue;
      const isCjFile = (att.name || '').toLowerCase().startsWith('cj');
      if (isCjFile) cadFilesImported++;
      await this.cadRepo.save(this.cadRepo.create({
        orderId: order.id, originalName: dl.originalName, fileName: dl.fileName,
        filePath: join(process.cwd(), 'uploads', 'cad', dl.fileName),
        uploadedBy: att.createdBy?.name || 'Smartsheet Import', revisionNumber: 1,
        designerNotes: isCjFile ? 'Smartsheet import' : 'Reference image', status: CadFileStatus.UPLOADED,
      }));
      summary.attachmentsImported++;
    }
    if (order.status === OrderStatus.CAD_IN_PROGRESS && cadFilesImported > 0) {
      await this.orderRepo.update(order.id, { cadSubStatus: 'UPLOADED' });
    }
    const discussions: any[] = row.discussions || [];
    for (const disc of discussions) {
      for (const comment of (disc.comments || [])) {
        const text = comment.text || '';
        if (!text.trim()) continue;
        await this.msgRepo.save(this.msgRepo.create({
          orderId: order.id, authorId: systemUser?.id || 'import',
          authorName: comment.createdBy?.name || 'Smartsheet',
          authorRole: 'IMPORT', content: `[Smartsheet] ${text}`, isInternal: true, mentions: [],
        }));
        summary.commentsImported++;
      }
    }
  }

  // ── Main import ───────────────────────────────────────────────────────
  async importMayOrders(sheetId: string, from = '2026-05-15', to = '2026-05-31'): Promise<ImportSummary> {
    const summary: ImportSummary = {
      ordersCreated: 0, ordersUpdated: 0, ordersSkipped: 0, customersCreated: 0,
      attachmentsImported: 0, commentsImported: 0, errors: [], orders: [],
    };

    // Fetch ALL rows without heavy includes first (reliable, returns every row)
    // then fetch per-row attachments+discussions only for rows in the date range
    this.logger.log('Fetching Smartsheet row index...');
    const baseSheet  = await this.smGet(`/sheets/${sheetId}`);
    // Fetch with includes to get attachment/discussion metadata for merging
    const richSheet  = await this.smGet(`/sheets/${sheetId}?include=attachments,discussions`);
    // Build a map of rowId → rich row data (may be partial if API truncates)
    const richMap: Record<string, any> = {};
    for (const r of (richSheet.rows || [])) richMap[String(r.id)] = r;
    // Merge: start with the full base list, overlay rich data where available
    const mergedRows = (baseSheet.rows || []).map((r: any) => richMap[String(r.id)] ?? r);
    const sheet = { ...baseSheet, rows: mergedRows };

    // Build column title → index map
    const colMap: Record<string, number> = {};
    sheet.columns.forEach((c: any) => { colMap[c.title] = c.id; });

    const getCell = (row: any, title: string): string | null => {
      const colId = colMap[title];
      if (!colId) return null;
      const cell = row.cells?.find((c: any) => c.columnId === colId);
      return cell?.displayValue ?? cell?.value ?? null;
    };

    // Filter rows by date range
    const fromDate = new Date(from);
    const toDate = new Date(to); toDate.setHours(23, 59, 59, 999);
    const rows: any[] = (sheet.rows || []).filter((r: any) => {
      const d = new Date(r.createdAt);
      return d >= fromDate && d <= toDate;
    });

    this.logger.log(`Found ${rows.length} rows in ${from} → ${to}`);

    // Get a system user to attach messages to
    const systemUser = await this.userRepo.findOne({ where: { role: UserRole.ADMIN } });

    for (const row of rows) {
      try {
        const smartsheetPo = getCell(row, 'PO #') || '';

        // ── Map fields first (needed for both create and update paths) ───
        const email      = getCell(row, 'Email (final)') || getCell(row, 'Email') || '';
        const storeName  = getCell(row, 'Store Name') || '';
        const fullName   = getCell(row, 'Customer Full Name') || getCell(row, 'Customer Name') || '';
        const rawStatus  = (getCell(row, 'Status') || '').trim();
        const status     = mapSmartsheetStatus(rawStatus) ?? OrderStatus.CAD_IN_PROGRESS;

        // ── Deduplication: update data fields if exists, preserving workflow status ──
        const exists = await this.orderRepo.findOne({ where: { refCustomerPo: smartsheetPo } });
        if (exists && smartsheetPo) {
          const dataUpdate: Partial<Order> = {
            ...(getCell(row, 'Kira Sku #')                                           ? { kiraSkuNumber:   getCell(row, 'Kira Sku #')! }                                           : {}),
            ...(getCell(row, 'Tracking') || getCell(row, 'Tracking #')               ? { trackingNumber:  getCell(row, 'Tracking') || getCell(row, 'Tracking #')! }              : {}),
            ...(this.parseCost(getCell(row, 'Kira Quoted Cost') || getCell(row, 'Cost')) != null ? { quotedCost: this.parseCost(getCell(row, 'Kira Quoted Cost') || getCell(row, 'Cost'))! } : {}),
            ...(getCell(row, 'Invoice #')                                             ? { invoiceNumber:   getCell(row, 'Invoice #')! }                                           : {}),
            ...(getCell(row, 'Ship Method')                                           ? { shipMethod:      getCell(row, 'Ship Method')! }                                         : {}),
            ...(getCell(row, 'Vendor Name')                                           ? { vendorName:      getCell(row, 'Vendor Name')! }                                         : {}),
            ...(getCell(row, 'Factory Status')                                        ? { factoryStatus:   getCell(row, 'Factory Status')! }                                      : {}),
            ...(getCell(row, 'VPO order details')                                     ? { vpoOrderDetails: getCell(row, 'VPO order details')! }                                   : {}),
            ...(getCell(row, 'RC Order #')                                            ? { rcOrderNumber:   getCell(row, 'RC Order #')! }                                          : {}),
            ...(getCell(row, 'RC Job Bag #')                                          ? { rcJobBagNumber:  getCell(row, 'RC Job Bag #')! }                                        : {}),
            ...(getCell(row, 'RC VPO #')                                              ? { rcVpoNumber:     getCell(row, 'RC VPO #')! }                                            : {}),
            ...(getCell(row, 'Time Frame')                                            ? { timeFrame:       getCell(row, 'Time Frame')! }                                          : {}),
            ...(getCell(row, 'Customer Comments') || getCell(row, 'Additional Comments') ? { customerNotes: getCell(row, 'Customer Comments') || getCell(row, 'Additional Comments')! } : {}),
            ...(getCell(row, 'Kira Status Comments')                                  ? { internalNotes:   getCell(row, 'Kira Status Comments')! }                               : {}),
            smartsheetRowId: String(row.id),
          };
          if (Object.keys(dataUpdate).length > 0) await this.orderRepo.update(exists.id, dataUpdate);
          summary.ordersUpdated++;
          summary.orders.push({ po: exists.poNumber, smartsheetPo, status: rawStatus, customer: storeName || fullName, action: 'updated' });
          continue;
        }

        // ── Customer ────────────────────────────────────────────────────
        const { user: customer, created } = await this.findOrCreateCustomer(email, storeName, fullName);
        if (created) summary.customersCreated++;

        // ── PO number ───────────────────────────────────────────────────
        const poNumber = await this.nextPo();
        const poWithRef = smartsheetPo ? `${poNumber} (${smartsheetPo})` : poNumber;

        // ── Build order data ─────────────────────────────────────────────
        const orderData: Partial<Order> = {
          poNumber: poWithRef,
          refCustomerPo: smartsheetPo || undefined,
          smartsheetRowId: String(row.id),
          status,
          manufacturingPath: ManufacturingPath.STANDARD,
          customerId: customer.id,
          customerEmail: customer.email,
          customerFullName: fullName || `${customer.firstName} ${customer.lastName}`,
          storeName: storeName || customer.storeName,
          kiraSkuNumber: getCell(row, 'Kira Sku #') || undefined,
          orderType: getCell(row, 'Type') || undefined,
          size: getCell(row, 'Size') || getCell(row, 'Ring Size or Bracelet Length') || undefined,
          metalType: getCell(row, 'Metal Type') || undefined,
          metalColor: getCell(row, 'Metal Color') || undefined,
          diamondType: getCell(row, 'Natural or Lab') || undefined,
          diamondQuality: getCell(row, 'Dia Quality') || getCell(row, 'Diamond Quality') || undefined,
          centerStoneShape: getCell(row, 'Center Stone Shape') || undefined,
          approximateCaratWeight: getCell(row, 'Approximate Carat Weight') || undefined,
          centerStoneRatio: getCell(row, 'Center Stone Ratio') || undefined,
          quotedCost: this.parseCost(getCell(row, 'Kira Quoted Cost') || getCell(row, 'Cost')) ?? undefined,
          invoiceNumber: getCell(row, 'Invoice #') || undefined,
          shipMethod: getCell(row, 'Ship Method') || undefined,
          vendorName: getCell(row, 'Vendor Name') || undefined,
          trackingNumber: getCell(row, 'Tracking') || getCell(row, 'Tracking #') || undefined,
          rcOrderNumber: getCell(row, 'RC Order #') || undefined,
          rcJobBagNumber: getCell(row, 'RC Job Bag #') || undefined,
          rcVpoNumber: getCell(row, 'RC VPO #') || undefined,
          vpoOrderDetails: getCell(row, 'VPO order details') || undefined,
          factoryStatus: getCell(row, 'Factory Status') || undefined,
          referenceWeblink: getCell(row, 'Reference Weblink') || getCell(row, 'Upload Reference Link') || undefined,
          phoneNumber: getCell(row, 'Phone Number') || undefined,
          headStyle: getCell(row, 'Head Style') || undefined,
          shankStyle: getCell(row, 'Shank Style') || undefined,
          timeFrame: getCell(row, 'Time Frame') || undefined,
          stockNumber: getCell(row, 'Stock No# (If from Inventory)') || undefined,
          salesRepEmail: getCell(row, 'Sales Rep Email') || undefined,
          salesRepName: getCell(row, 'Sales Rep Email') || undefined,
          customerNotes: getCell(row, 'Customer Comments') || getCell(row, 'Additional Comments') || undefined,
          internalNotes: getCell(row, 'Kira Status Comments') || undefined,
          isPriorityCustomer: customer.isPriority,
        };

        const order = await this.orderRepo.save(this.orderRepo.create(orderData));
        // Backdate createdAt to Smartsheet row date, not today
        if (row.createdAt) {
          await this.orderRepo.query(
            `UPDATE orders SET "createdAt" = $1 WHERE id = $2`,
            [new Date(row.createdAt), order.id],
          );
          order.createdAt = new Date(row.createdAt);
        }
        summary.ordersCreated++;
        summary.orders.push({ po: poWithRef, smartsheetPo, status: rawStatus, customer: storeName || fullName, action: 'created' });

        // ── Attachments: CJ-prefix filename → Design file, everything else → Reference image ──
        const attachments: any[] = row.attachments || [];
        let cadFilesImported = 0;   // CJ design files only — not reference images
        for (const att of attachments) {
          const dl = await this.downloadAttachment(sheetId, att.id);
          if (!dl) continue;
          const isCjFile = (att.name || '').toLowerCase().startsWith('cj');
          if (isCjFile) cadFilesImported++;
          await this.cadRepo.save(this.cadRepo.create({
            orderId: order.id,
            originalName: dl.originalName,
            fileName: dl.fileName,
            filePath: join(process.cwd(), 'uploads', 'cad', dl.fileName),
            uploadedBy: att.createdBy?.name || 'Smartsheet Import',
            revisionNumber: 1,
            designerNotes: isCjFile ? 'Smartsheet import' : 'Reference image',
            status: CadFileStatus.UPLOADED,
          }));
          summary.attachmentsImported++;
        }

        // Only set UPLOADED when actual CJ design files exist — reference images alone keep label as "Pending CAD"
        if (order.status === OrderStatus.CAD_IN_PROGRESS && cadFilesImported > 0) {
          await this.orderRepo.update(order.id, { cadSubStatus: 'UPLOADED' });
        }

        // ── Discussions → order messages ─────────────────────────────────
        const discussions: any[] = row.discussions || [];
        for (const disc of discussions) {
          for (const comment of (disc.comments || [])) {
            const author = comment.createdBy?.name || 'Smartsheet';
            const text = comment.text || '';
            if (!text.trim()) continue;
            await this.msgRepo.save(this.msgRepo.create({
              orderId: order.id,
              authorId: systemUser?.id || 'import',
              authorName: author,
              authorRole: 'IMPORT',
              content: `[Smartsheet] ${text}`,
              isInternal: true,
              mentions: [],
            }));
            summary.commentsImported++;
          }
        }

      } catch (err) {
        const po = row.cells?.[4]?.value || row.id;
        const msg = `Row ${po}: ${err.message}`;
        summary.errors.push(msg);
        this.logger.error(msg);
      }
    }

    this.logger.log(`Import complete — created ${summary.ordersCreated}, updated ${summary.ordersUpdated}, skipped ${summary.ordersSkipped}, errors ${summary.errors.length}`);
    return summary;
  }

  // ── Second pass: attach images + comments to already-imported orders ──
  // When from/to are omitted, processes ALL rows in the sheet (no date filter).
  async patchMediaAndComments(sheetId: string, from?: string, to?: string): Promise<{ attachmentsImported: number; commentsImported: number; errors: string[] }> {
    const result = { attachmentsImported: 0, commentsImported: 0, errors: [] as string[] };
    const systemUser = await this.userRepo.findOne({ where: { role: UserRole.ADMIN } });

    const sheet = await this.smGet(`/sheets/${sheetId}?include=attachments,discussions`);
    let rows: any[] = sheet.rows || [];
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to); toDate.setHours(23, 59, 59, 999);
      rows = rows.filter((r: any) => {
        const d = new Date(r.createdAt); return d >= fromDate && d <= toDate;
      });
    }

    const colMap: Record<string, number> = {};
    sheet.columns.forEach((c: any) => { colMap[c.title] = c.id; });
    const getCell = (row: any, title: string) => {
      const cell = row.cells?.find((c: any) => c.columnId === colMap[title]);
      return cell?.displayValue ?? cell?.value ?? null;
    };

    for (const row of rows) {
      try {
        const smartsheetPo = getCell(row, 'PO #') || '';
        if (!smartsheetPo) continue;

        const order = await this.orderRepo.findOne({ where: { refCustomerPo: smartsheetPo } });
        if (!order) continue;

        // Backfill smartsheetRowId if missing
        if (!order.smartsheetRowId) {
          await this.orderRepo.update(order.id, { smartsheetRowId: String(row.id) });
        }

        // Attachments: CJ-prefix filename → Design file, everything else → Reference image
        for (const att of (row.attachments || [])) {
          const existing = await this.cadRepo.findOne({ where: { orderId: order.id, originalName: att.name } });
          if (existing) continue;
          const dl = await this.downloadAttachment(sheetId, att.id);
          if (!dl) continue;
          const isCjFile = (att.name || '').toLowerCase().startsWith('cj');
          await this.cadRepo.save(this.cadRepo.create({
            orderId: order.id,
            originalName: dl.originalName,
            fileName: dl.fileName,
            filePath: join(process.cwd(), 'uploads', 'cad', dl.fileName),
            uploadedBy: att.createdBy?.name || 'Smartsheet Import',
            revisionNumber: 1,
            designerNotes: isCjFile ? 'Smartsheet import' : 'Reference image',
            status: CadFileStatus.UPLOADED,
          }));
          result.attachmentsImported++;
        }

        // Discussions → messages (fetch comments separately — sheet-level doesn't include text)
        for (const disc of (row.discussions || [])) {
          try {
            const fullDisc = await this.smGet(`/sheets/${sheetId}/discussions/${disc.id}`);
            for (const comment of (fullDisc.comments || [])) {
              const text = (comment.text || '').trim();
              if (!text) continue;
              const content = `[Smartsheet] ${text}`;
              const exists = await this.msgRepo.findOne({ where: { orderId: order.id, content } });
              if (exists) continue;
              await this.msgRepo.save(this.msgRepo.create({
                orderId: order.id,
                authorId: systemUser?.id || 'import',
                authorName: comment.createdBy?.name || 'Smartsheet',
                authorRole: 'IMPORT',
                content,
                isInternal: true,
                mentions: [],
              }));
              result.commentsImported++;
            }
          } catch { /* skip discussion if fetch fails */ }
        }
      } catch (e) {
        result.errors.push(`Row ${row.id}: ${e.message}`);
      }
    }

    this.logger.log(`Media patch complete — attachments:${result.attachmentsImported} comments:${result.commentsImported} errors:${result.errors.length}`);
    return result;
  }

  // ── Sync Smartsheet conversations for one specific order ──────────────
  async syncCommentsForOrder(orderId: string, sheetId: string): Promise<{ commentsImported: number; errors: string[] }> {
    const result = { commentsImported: 0, errors: [] as string[] };

    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) { result.errors.push('Order not found'); return result; }
    if (!order.smartsheetRowId) { result.errors.push('Order has no linked Smartsheet row'); return result; }

    const systemUser = await this.userRepo.findOne({ where: { role: UserRole.ADMIN } });

    try {
      const row = await this.smGet(`/sheets/${sheetId}/rows/${order.smartsheetRowId}?include=discussions`);
      for (const disc of (row.discussions || [])) {
        try {
          const fullDisc = await this.smGet(`/sheets/${sheetId}/discussions/${disc.id}`);
          for (const comment of (fullDisc.comments || [])) {
            const text = (comment.text || '').trim();
            if (!text) continue;
            const content = `[Smartsheet] ${text}`;
            const exists = await this.msgRepo.findOne({ where: { orderId, content } });
            if (exists) continue;
            await this.msgRepo.save(this.msgRepo.create({
              orderId,
              authorId: systemUser?.id || 'system',
              authorName: comment.createdBy?.name || 'Smartsheet',
              authorRole: 'IMPORT',
              content,
              isInternal: true,
              mentions: [],
            }));
            result.commentsImported++;
          }
        } catch { /* skip individual discussion fetch errors */ }
      }
    } catch (e) {
      result.errors.push(`Smartsheet fetch failed: ${e.message}`);
    }

    this.logger.log(`Comment sync for ${orderId} — imported:${result.commentsImported} errors:${result.errors.length}`);
    return result;
  }
}
