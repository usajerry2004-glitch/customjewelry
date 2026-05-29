import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Order, OrderStatus } from '../../database/entities/order.entity';

const STATUS_MAP: Record<string, OrderStatus> = {
  'ready to invoice':         OrderStatus.READY_TO_INVOICE,
  'ready to ship':            OrderStatus.READY_TO_SHIP,
  'shipped':                  OrderStatus.SHIPPED,
  'delivered':                OrderStatus.DELIVERED,
  'pending cad':              OrderStatus.PENDING_CAD,
  'cad in progress':          OrderStatus.CAD_IN_PROGRESS,
  'customer approved':        OrderStatus.CUSTOMER_APPROVED,
  'customer rejected':        OrderStatus.CUSTOMER_REJECTED,
  'sku creation':             OrderStatus.SKU_CREATION,
  'vpo issued':               OrderStatus.VPO_ISSUED,
  'pending contractor':       OrderStatus.PENDING_CONTRACTOR,
  'order job bag created':    OrderStatus.ORDER_JOB_BAG_CREATED,
  'waiting confirmation':     OrderStatus.WAITING_CONFIRMATION,
  'cancelled':                OrderStatus.CANCELLED,
};

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

    for (const row of rows) {
      const poNumber = str(row['PO #']);
      if (!poNumber) { skipped++; continue; }

      const exists = await this.orderRepo.findOne({ where: { poNumber } });
      if (exists) { skipped++; continue; }

      const statusRaw = String(row['Status'] ?? '').trim().toLowerCase();
      const status = STATUS_MAP[statusRaw] || OrderStatus.WAITING_CONFIRMATION;

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
          kiraSkuNumber:           str(row['Kira Sku #']),
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
          quotedCost:              money(row['Kira Quoted Cost']),
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
          customerEmailApproval:   String(row['Customer Email Contact approval'] ?? '').toLowerCase() === 'approved',
          sentToRc:                String(row['Send to RC'] ?? '').toLowerCase() === 'yes',
          isArchived:              String(row['Archive'] ?? '').toLowerCase() === 'yes',
          sentToCustomer:          String(row['Send to Customer'] ?? '').toLowerCase() === 'yes',
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
