import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Order, OrderStatus } from '../../database/entities/order.entity';

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

@Injectable()
export class ImportService {
  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
  ) {}

  async importFromFile(filePath: string, preview = false): Promise<{
    imported: number; skipped: number; errors: string[]; preview?: any[]
  }> {
    return this.importFromExcel(filePath, preview);
  }

  async importFromExcel(filePath: string, preview = false): Promise<{ imported: number; skipped: number; errors: string[]; preview?: any[] }> {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];

    // Preview mode: return first 10 rows parsed without saving
    if (preview) {
      const previewRows = rows.slice(0, 10).map(row => ({
        poNumber:         str(row['PO #']),
        storeName:        str(row['Store Name']),
        customerFullName: str(row['Customer Full Name']) || str(row['Customer Name']),
        orderType:        str(row['Type']),
        metalType:        str(row['Metal Type']),
        metalColor:       str(row['Metal Color']),
        status:           str(row['Status']) || 'Waiting Confirmation',
        quotedCost:       money(row['Kira Quoted Cost']),
      }));
      return { imported: 0, skipped: 0, errors: [], preview: previewRows };
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // One query for every existing PO number instead of a findOne() per row —
    // a spreadsheet import can be hundreds/thousands of rows.
    const existingRows = await this.orderRepo.find({ select: ['poNumber'] });
    const seenPoNumbers = new Set(existingRows.map(r => r.poNumber));

    for (const row of rows) {
      const poNumber = str(row['PO #']);
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

      try {
        const order = this.orderRepo.create({
          poNumber,
          status,
          cadSubStatus,
          kiraSkuNumber:           skuNumberV,
          trackingNumber:          str(row['Tracking']),
          storeName:               str(row['Store Name']),
          customerFullName:        str(row['Customer Full Name']) || str(row['Customer Name']),
          customerEmail:           str(row['Email (final)']) || str(row['Email']),
          salesRepEmail:           str(row['Sales Rep Email']),
          orderType:               str(row['Type']),
          size:                    str(row['Size']) || str(row['Ring Size']),
          metalType:               str(row['Metal Type']),
          metalColor:              str(row['Metal Color']),
          diamondType:             str(row['Natural or Lab']),
          diamondQuality:          str(row['Dia Quality']),
          centerStoneShape:        str(row['Center Stone Shape']),
          approximateCaratWeight:  str(row['Approximate Carat Weight']),
          centerStoneRatio:        str(row['Center Stone Ratio']),
          referenceWeblink:        str(row['Reference Weblink']),
          stockNumber:             str(row['Stock No# (If from Inventory)']),
          customerNotes:           str(row['Customer Comments']),
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
          shankStyle:              str(row['Shank Style']),
          timeFrame:               str(row['Time Frame']),
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
      } catch (e: any) {
        errors.push(`${poNumber}: ${e.message}`);
      }
    }

    return { imported, skipped, errors };
  }
}
