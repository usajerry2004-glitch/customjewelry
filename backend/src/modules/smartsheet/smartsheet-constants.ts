import { OrderStatus } from '../../database/entities/order.entity';

export const STATUS_MAP: Record<string, OrderStatus> = {
  // New orders (freshly submitted, not yet assigned)
  'new':                             OrderStatus.NEW,

  // CAD In Progress (all early-stage statuses map here)
  'waiting confirmation':            OrderStatus.CAD_IN_PROGRESS,
  'waiting for confirmation':        OrderStatus.CAD_IN_PROGRESS,
  'awaiting confirmation':           OrderStatus.CAD_IN_PROGRESS,
  'pending cad 3dm':                 OrderStatus.CAD_IN_PROGRESS,
  'pending cad':                     OrderStatus.CAD_IN_PROGRESS,
  'cad pending':                     OrderStatus.CAD_IN_PROGRESS,
  'pending 3dm':                     OrderStatus.CAD_IN_PROGRESS,
  '3dm pending':                     OrderStatus.CAD_IN_PROGRESS,
  'needs cad':                       OrderStatus.CAD_IN_PROGRESS,
  'cad in progress':                 OrderStatus.CAD_IN_PROGRESS,
  'cad design in progress':          OrderStatus.CAD_IN_PROGRESS,
  'design in progress':              OrderStatus.CAD_IN_PROGRESS,
  'in progress':                     OrderStatus.CAD_IN_PROGRESS,
  'cad wip':                         OrderStatus.CAD_IN_PROGRESS,
  'order revision':                  OrderStatus.CAD_IN_PROGRESS,
  'revision requested':              OrderStatus.CAD_IN_PROGRESS,
  'revision':                        OrderStatus.CAD_IN_PROGRESS,
  'needs revision':                  OrderStatus.CAD_IN_PROGRESS,
  'waiting for price':               OrderStatus.CAD_IN_PROGRESS,
  'price pending':                   OrderStatus.CAD_IN_PROGRESS,
  'awaiting price':                  OrderStatus.CAD_IN_PROGRESS,

  // Customer approved → SKU Creation stage
  'customer approved':               OrderStatus.SKU_CREATION,
  'customer cad approved':           OrderStatus.SKU_CREATION,
  'approved by customer':            OrderStatus.SKU_CREATION,
  'cad approved':                    OrderStatus.SKU_CREATION,
  'approved':                        OrderStatus.SKU_CREATION,

  // SKU Creation
  'kira sku issued':                 OrderStatus.SKU_CREATION,
  'sku issued':                      OrderStatus.SKU_CREATION,
  'sku creation':                    OrderStatus.SKU_CREATION,
  'sku created':                     OrderStatus.SKU_CREATION,
  'sku pending':                     OrderStatus.SKU_CREATION,

  // VPO Issued
  'vpo issued to cj':                OrderStatus.VPO_ISSUED,
  'vpo issued':                      OrderStatus.VPO_ISSUED,
  'vpo issued to vendor':            OrderStatus.VPO_ISSUED,
  'vpo sent':                        OrderStatus.VPO_ISSUED,
  'order & job bag created':         OrderStatus.VPO_ISSUED,
  'order and job bag created':       OrderStatus.VPO_ISSUED,
  'dia added to job bag':            OrderStatus.VPO_ISSUED,
  'diamond added to job bag':        OrderStatus.VPO_ISSUED,
  'job bag created':                 OrderStatus.VPO_ISSUED,
  'order job bag created':           OrderStatus.VPO_ISSUED,
  'job bag':                         OrderStatus.VPO_ISSUED,

  // Repair
  'pending contractor':              OrderStatus.REPAIR,
  'with contractor':                 OrderStatus.REPAIR,
  'at contractor':                   OrderStatus.REPAIR,

  // Manufactured (Ready to Ship / Invoice)
  'pending igi':                     OrderStatus.MANUFACTURED,
  'with vendor':                     OrderStatus.MANUFACTURED,
  'ready to ship':                   OrderStatus.MANUFACTURED,
  'ready for shipping':              OrderStatus.MANUFACTURED,
  'ready to invoice':                OrderStatus.MANUFACTURED,
  'invoice ready':                   OrderStatus.MANUFACTURED,

  // Shipped → treated as Manufactured (package is on its way, still in fulfilment)
  'shipped':                         OrderStatus.MANUFACTURED,
  'dispatched':                      OrderStatus.MANUFACTURED,
  'delivered':                       OrderStatus.MANUFACTURED,
  'received':                        OrderStatus.MANUFACTURED,

  // Repair
  'repair':                          OrderStatus.REPAIR,
  'in repair':                       OrderStatus.REPAIR,

  // Completed
  'completed':                       OrderStatus.COMPLETED,
  'complete':                        OrderStatus.COMPLETED,

  // Cancelled
  'customer rejected':               OrderStatus.CANCELLED,
  'cad rejected':                    OrderStatus.CANCELLED,
  'rejected':                        OrderStatus.CANCELLED,
  'cancelled':                       OrderStatus.CANCELLED,
  'canceled':                        OrderStatus.CANCELLED,
  'void':                            OrderStatus.CANCELLED,
  'voided':                          OrderStatus.CANCELLED,
};

/**
 * Maps a raw Smartsheet status string to an OrderStatus.
 * First tries exact match, then substring match.
 * Returns null if nothing matches (caller uses the existing order status).
 */
export function mapSmartsheetStatus(raw: string): OrderStatus | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  // Exact match
  if (STATUS_MAP[lower]) return STATUS_MAP[lower];

  // Substring match — raw contains a known key (e.g. "Kira SKU Issued - 2026" → "kira sku issued")
  for (const [key, value] of Object.entries(STATUS_MAP)) {
    if (lower.includes(key)) return value;
  }

  return null;
}

/** Column titles to Order field mappings used in both import and sync */
export const FIELD_MAP: [string, string][] = [
  ['Kira Sku #',                    'kiraSkuNumber'],
  ['Tracking',                      'trackingNumber'],
  ['Tracking #',                    'trackingNumber'],
  ['Invoice #',                     'invoiceNumber'],
  ['Ship Method',                   'shipMethod'],
  ['Vendor Name',                   'vendorName'],
  ['Factory Status',                'factoryStatus'],
  ['VPO order details',             'vpoOrderDetails'],
  ['RC Order #',                    'rcOrderNumber'],
  ['RC Job Bag #',                  'rcJobBagNumber'],
  ['RC VPO #',                      'rcVpoNumber'],
  ['Time Frame',                    'timeFrame'],
  ['Store Name',                    'storeName'],
  ['Customer Name',                 'storeName'],
];
