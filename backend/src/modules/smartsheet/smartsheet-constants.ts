import { OrderStatus } from '../../database/entities/order.entity';

export const STATUS_MAP: Record<string, OrderStatus> = {
  // Waiting Confirmation
  'new':                             OrderStatus.WAITING_CONFIRMATION,
  'waiting confirmation':            OrderStatus.WAITING_CONFIRMATION,
  'waiting for confirmation':        OrderStatus.WAITING_CONFIRMATION,
  'awaiting confirmation':           OrderStatus.WAITING_CONFIRMATION,

  // Pending CAD
  'pending cad 3dm':                 OrderStatus.PENDING_CAD,
  'pending cad':                     OrderStatus.PENDING_CAD,
  'cad pending':                     OrderStatus.PENDING_CAD,
  'pending 3dm':                     OrderStatus.PENDING_CAD,
  '3dm pending':                     OrderStatus.PENDING_CAD,
  'needs cad':                       OrderStatus.PENDING_CAD,

  // CAD In Progress
  'cad in progress':                 OrderStatus.CAD_IN_PROGRESS,
  'cad design in progress':          OrderStatus.CAD_IN_PROGRESS,
  'design in progress':              OrderStatus.CAD_IN_PROGRESS,
  'in progress':                     OrderStatus.CAD_IN_PROGRESS,
  'cad wip':                         OrderStatus.CAD_IN_PROGRESS,

  // Customer Approved
  'customer approved':               OrderStatus.CUSTOMER_APPROVED,
  'customer cad approved':           OrderStatus.CUSTOMER_APPROVED,
  'approved by customer':            OrderStatus.CUSTOMER_APPROVED,
  'cad approved':                    OrderStatus.CUSTOMER_APPROVED,
  'approved':                        OrderStatus.CUSTOMER_APPROVED,

  // Order Revision / Customer Rejected
  'customer rejected':               OrderStatus.ORDER_REVISION,
  'cad rejected':                    OrderStatus.ORDER_REVISION,
  'order revision':                  OrderStatus.ORDER_REVISION,
  'revision requested':              OrderStatus.ORDER_REVISION,
  'revision':                        OrderStatus.ORDER_REVISION,
  'needs revision':                  OrderStatus.ORDER_REVISION,
  'rejected':                        OrderStatus.ORDER_REVISION,

  // Waiting For Price
  'waiting for price':               OrderStatus.WAITING_FOR_PRICE,
  'price pending':                   OrderStatus.WAITING_FOR_PRICE,
  'awaiting price':                  OrderStatus.WAITING_FOR_PRICE,

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

  // Pending Contractor
  'pending contractor':              OrderStatus.PENDING_CONTRACTOR,
  'pending igi':                     OrderStatus.PENDING_CONTRACTOR,
  'with contractor':                 OrderStatus.PENDING_CONTRACTOR,
  'at contractor':                   OrderStatus.PENDING_CONTRACTOR,
  'with vendor':                     OrderStatus.PENDING_CONTRACTOR,

  // Order / Job Bag Created
  'order & job bag created':         OrderStatus.ORDER_JOB_BAG_CREATED,
  'order and job bag created':       OrderStatus.ORDER_JOB_BAG_CREATED,
  'dia added to job bag':            OrderStatus.ORDER_JOB_BAG_CREATED,
  'diamond added to job bag':        OrderStatus.ORDER_JOB_BAG_CREATED,
  'job bag created':                 OrderStatus.ORDER_JOB_BAG_CREATED,
  'order job bag created':           OrderStatus.ORDER_JOB_BAG_CREATED,
  'job bag':                         OrderStatus.ORDER_JOB_BAG_CREATED,

  // Ready to Invoice
  'ready to invoice':                OrderStatus.READY_TO_INVOICE,
  'invoice ready':                   OrderStatus.READY_TO_INVOICE,

  // Ready to Ship
  'ready to ship':                   OrderStatus.READY_TO_SHIP,
  'ready for shipping':              OrderStatus.READY_TO_SHIP,

  // Shipped
  'shipped':                         OrderStatus.SHIPPED,
  'dispatched':                      OrderStatus.SHIPPED,

  // Delivered
  'delivered':                       OrderStatus.DELIVERED,
  'received':                        OrderStatus.DELIVERED,

  // Repair
  'repair':                          OrderStatus.REPAIR,
  'in repair':                       OrderStatus.REPAIR,

  // Cancelled
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
];
