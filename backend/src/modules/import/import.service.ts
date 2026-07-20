import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { CadService } from '../cad/cad.service';
import { readZipEntries, mimeFromFilename } from './zip.util';

const SS_CANCELLED  = new Set(['cancelled', 'customer rejected']);

const SS_MANUFACTURED = new Set([
  'ready to ship', 'ready to invoice', 'shipped', 'delivered',
  'pending contractor', 'pending igi',
]);

const SS_VPO = new Set([
  'vpo issued to cj', 'order & job bag created', 'order & job bag crea',
  'dia added to job bag', 'kira sku issued',
]);

// Customer has approved the CAD — awaiting approval label
const SS_CUSTOMER_APPROVED = new Set(['customer approved']);

// CAD work is in progress — awaiting quote label
const SS_CAD = new Set(['pending cad 3dm', 'pending cad', 'cad in progress']);

// NEW — order received, no work started yet
const SS_NEW = new Set(['new', 'waiting confirmation', 'need info']);

function resolveImportedStatus(statusRaw: string, quotedCost: number | null, _skuNumber: string | null, _customerApproved: boolean): {
  status: OrderStatus;
  cadSubStatus: string | null;
  sentToCustomer: boolean;
} {
  const s = statusRaw.toLowerCase().trim();

  if (SS_CANCELLED.has(s))
    return { status: OrderStatus.CANCELLED, cadSubStatus: null, sentToCustomer: false };

  if (SS_MANUFACTURED.has(s))
    return { status: OrderStatus.MANUFACTURED, cadSubStatus: null, sentToCustomer: false };

  if (SS_VPO.has(s))
    return { status: OrderStatus.VPO_ISSUED, cadSubStatus: null, sentToCustomer: false };

  if (SS_CUSTOMER_APPROVED.has(s)) {
    // If a quote is present the CAD was sent for approval; otherwise the order already went to VPO
    if (quotedCost && quotedCost > 0)
      return { status: OrderStatus.CAD_IN_PROGRESS, cadSubStatus: 'UPLOADED', sentToCustomer: true };
    return { status: OrderStatus.VPO_ISSUED, cadSubStatus: null, sentToCustomer: false };
  }

  if (SS_CAD.has(s)) {
    // CAD started — awaiting approval if quote present, awaiting quote if not
    if (quotedCost && quotedCost > 0)
      return { status: OrderStatus.CAD_IN_PROGRESS, cadSubStatus: 'UPLOADED', sentToCustomer: true };
    return { status: OrderStatus.CAD_IN_PROGRESS, cadSubStatus: 'UPLOADED', sentToCustomer: false };
  }

  // "new", "waiting confirmation", "need info", or anything unrecognised → NEW
  return { status: OrderStatus.NEW, cadSubStatus: null, sentToCustomer: false };
}

function str(val: any): string | null {
  const s = String(val ?? '').trim();
  return s || null;
}

function money(val: any): number | null {
  const s = String(val ?? '').replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Design-specification CSV columns (from a customer's own site export) that
// have no dedicated Order column — folded into customerNotes as a labeled
// block instead of being silently dropped on import.
const NOTE_ONLY_COLUMNS: { header: string; label: string }[] = [
  { header: 'Center Stone Size Category', label: 'Center Stone Size' },
  { header: 'Reference Length (mm)',      label: 'Reference Length (mm)' },
  { header: 'Reference Width (mm)',       label: 'Reference Width (mm)' },
  { header: 'Reference Depth (mm)',       label: 'Reference Depth (mm)' },
  { header: 'Reference Closest Carat',    label: 'Reference Closest Carat' },
  { header: 'Setting Type',               label: 'Setting Type' },
  { header: 'Prong Count',                label: 'Prong Count' },
  { header: 'Corner Prong Count',         label: 'Corner Prong Count' },
  { header: 'Ring Profile',               label: 'Ring Profile' },
  { header: 'Band Width (mm)',            label: 'Band Width (mm)' },
  { header: 'Has Accent Stones',          label: 'Accent Stones' },
  { header: 'Accent Stone Cut',           label: 'Accent Stone Cut' },
  { header: 'Accent Distance',            label: 'Accent Distance' },
  { header: 'Side Stones',                label: 'Side Stones' },
  { header: 'Cathedral',                  label: 'Cathedral' },
  { header: 'Hidden Halo',                label: 'Hidden Halo' },
];

function buildDesignSpecNotes(row: any): string | null {
  const parts = NOTE_ONLY_COLUMNS
    .map(({ header, label }) => {
      const v = str(row[header]);
      return v ? `${label}: ${v}` : null;
    })
    .filter((v): v is string => !!v);

  const ringPreferences = str(row['Ring Preferences Notes']);
  if (ringPreferences) parts.push(`Ring Preferences: ${ringPreferences}`);
  const engraving = str(row['Engraving Text']);
  if (engraving) parts.push(`Engraving: "${engraving}"`);

  return parts.length ? parts.join('\n') : null;
}

export interface ImportOptions {
  overrides?: { customerFullName?: string; customerEmail?: string; storeName?: string };
  imagesZipPath?: string;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    private readonly cadService: CadService,
  ) {}

  async importFromFile(filePath: string, preview = false, options: ImportOptions = {}): Promise<{
    imported: number; skipped: number; errors: string[]; preview?: any[]
  }> {
    return this.importFromExcel(filePath, preview, options);
  }

  async importFromExcel(filePath: string, preview = false, options: ImportOptions = {}): Promise<{ imported: number; skipped: number; errors: string[]; preview?: any[] }> {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];

    // Preview mode: return first 10 rows parsed without saving
    if (preview) {
      const previewRows = rows.slice(0, 10).map(row => ({
        poNumber:         str(row['PO #']) || str(row['Order Reference']),
        storeName:        str(row['Store Name']) || options.overrides?.storeName,
        customerFullName: str(row['Customer Full Name']) || str(row['Customer Name']) || options.overrides?.customerFullName,
        orderType:        str(row['Type']),
        metalType:        str(row['Metal Type']) || str(row['Metal Karat']),
        metalColor:       str(row['Metal Color']),
        status:           str(row['Status']) || 'Waiting Confirmation',
        quotedCost:       money(row['Kira Quoted Cost']),
      }));
      return { imported: 0, skipped: 0, errors: [], preview: previewRows };
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Reference photos delivered alongside a design-spec CSV as a ZIP —
    // matched to a row by "Reference Image Filename". Optional; absent for
    // the plain order-import format.
    const imagesZip = options.imagesZipPath ? readZipEntries(readFileSync(options.imagesZipPath)) : null;

    // One query for every existing PO number instead of a findOne() per row —
    // a spreadsheet import can be hundreds/thousands of rows.
    const existingRows = await this.orderRepo.find({ select: ['poNumber'] });
    const seenPoNumbers = new Set(existingRows.map(r => r.poNumber));

    for (const row of rows) {
      const poNumber = str(row['PO #']) || str(row['Order Reference']);
      if (!poNumber) { skipped++; continue; }

      if (seenPoNumbers.has(poNumber)) { skipped++; continue; }
      seenPoNumbers.add(poNumber); // also dedupe against earlier rows in this same file

      const statusRaw   = String(row['Status'] ?? '').trim();
      const quotedCostV = money(row['Kira Quoted Cost']);
      const skuNumberV  = str(row['Kira Sku #']);
      const custApproved = String(row['Customer Email Contact approval'] ?? '').toLowerCase() === 'approved';
      const { status, cadSubStatus, sentToCustomer: sentToCustomerV } = resolveImportedStatus(statusRaw, quotedCostV, skuNumberV, custApproved);

      let processedDate: Date | null = null;
      const pdRaw = row['Processed Date'];
      if (pdRaw) {
        const d = new Date(pdRaw);
        if (!isNaN(d.getTime())) processedDate = d;
      }

      // Design-spec columns with no dedicated Order field get folded into the
      // notes, alongside whatever the plain "Customer Comments" column held.
      const notes = [str(row['Customer Comments']), buildDesignSpecNotes(row)].filter(Boolean).join('\n\n') || null;

      try {
        const order = this.orderRepo.create({
          poNumber,
          status,
          cadSubStatus,
          kiraSkuNumber:           skuNumberV,
          trackingNumber:          str(row['Tracking']),
          storeName:               str(row['Store Name']) || options.overrides?.storeName,
          customerFullName:        str(row['Customer Full Name']) || str(row['Customer Name']) || options.overrides?.customerFullName,
          customerEmail:           str(row['Email (final)']) || str(row['Email']) || options.overrides?.customerEmail,
          salesRepEmail:           str(row['Sales Rep Email']),
          orderType:               str(row['Type']),
          size:                    str(row['Size']) || str(row['Ring Size']),
          metalType:               str(row['Metal Type']) || str(row['Metal Karat']),
          metalColor:              str(row['Metal Color']),
          diamondType:             str(row['Natural or Lab']),
          diamondQuality:          str(row['Dia Quality']),
          centerStoneShape:        str(row['Center Stone Shape']),
          approximateCaratWeight:  str(row['Approximate Carat Weight']) || str(row['Center Stone Carat']),
          centerStoneRatio:        str(row['Center Stone Ratio']) || str(row['Stone Ratio']),
          referenceWeblink:        str(row['Reference Weblink']) || str(row['Reference Image Link']),
          stockNumber:             str(row['Stock No# (If from Inventory)']),
          customerNotes:           notes,
          quotedCost:              quotedCostV,
          goldLockPrice:           money(row['Gold Lock']),
          invoiceNumber:           str(row['Invoice #']),
          shipMethod:              str(row['Ship Method']),
          vendorName:              str(row['Vendor Name']),
          rcOrderNumber:           str(row['RC Order #']),
          rcJobBagNumber:          str(row['RC Job Bag #']),
          rcVpoNumber:             str(row['RC VPO #']),
          vpoOrderDetails:         str(row['VPO order details']),
          factoryStatus:           str(row['Factory Status']),
          headStyle:               str(row['Head Style']) || str(row['Prong/Head Style']),
          shankStyle:              str(row['Shank Style']) || str(row['Band Style']),
          timeFrame:               str(row['Time Frame']) || str(row['Time Frame (weeks)']),
          phoneNumber:             str(row['Phone Number']),
          refCustomerPo:           str(row['Ref Customer PO#']) || str(row['Customer PO# / Reference No#']),
          customerEmailApproval:   custApproved,
          sentToRc:                String(row['Send to RC'] ?? '').toLowerCase() === 'yes',
          isArchived:              String(row['Archive'] ?? '').toLowerCase() === 'yes',
          sentToCustomer:          sentToCustomerV,
          processedDate,
        });
        await this.orderRepo.save(order);
        imported++;

        await this.importReferenceImage(order.id, poNumber, row, imagesZip, errors);
      } catch (e: any) {
        errors.push(`${poNumber}: ${e.message}`);
      }
    }

    return { imported, skipped, errors };
  }

  // Attaches a reference photo to the just-created order — from the ZIP
  // (matched by "Reference Image Filename") if one was provided, otherwise
  // fetched from "Reference Image Link" if that's a reachable URL. Reuses
  // CadService's own upload path so the existing per-order reference cap and
  // Spaces upload logic stay in one place. Never fails the import — a bad or
  // missing photo just gets logged as a warning, the order itself is already saved.
  private async importReferenceImage(
    orderId: string,
    poNumber: string,
    row: any,
    imagesZip: Map<string, Buffer> | null,
    errors: string[],
  ): Promise<void> {
    const filename = str(row['Reference Image Filename']);
    const link = str(row['Reference Image Link']);

    try {
      let buffer: Buffer | null = null;
      let name = filename || 'reference.jpg';
      let mimetype = filename ? mimeFromFilename(filename) : 'image/jpeg';

      if (filename && imagesZip?.has(filename)) {
        buffer = imagesZip.get(filename)!;
      } else if (link) {
        const res = await fetch(link);
        if (res.ok) {
          buffer = Buffer.from(await res.arrayBuffer());
          name = filename || link.split('/').pop() || 'reference.jpg';
          mimetype = res.headers.get('content-type') || mimeFromFilename(name);
        }
      }

      if (buffer) {
        const file = { buffer, originalname: name, mimetype } as Express.Multer.File;
        await this.cadService.uploadReference(orderId, file, 'import');
      } else if (filename) {
        // Filename was given but not found in the zip and no link to fall back on.
        errors.push(`${poNumber}: reference image "${filename}" was not found in the uploaded ZIP`);
      }
    } catch (e: any) {
      this.logger.warn(`Reference image import failed for ${poNumber}: ${e.message}`);
      errors.push(`${poNumber}: reference image import failed — ${e.message}`);
    }
  }
}
