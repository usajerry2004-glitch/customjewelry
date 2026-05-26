export enum OrderStatus {
  WAITING_CONFIRMATION = 'WAITING_CONFIRMATION',
  PENDING_CAD = 'PENDING_CAD',
  CAD_IN_PROGRESS = 'CAD_IN_PROGRESS',
  CUSTOMER_APPROVED = 'CUSTOMER_APPROVED',
  CUSTOMER_REJECTED = 'CUSTOMER_REJECTED',
  SKU_CREATION = 'SKU_CREATION',
  VPO_ISSUED = 'VPO_ISSUED',
  PENDING_CONTRACTOR = 'PENDING_CONTRACTOR',
  ORDER_JOB_BAG_CREATED = 'ORDER_JOB_BAG_CREATED',
  READY_TO_INVOICE = 'READY_TO_INVOICE',
  READY_TO_SHIP = 'READY_TO_SHIP',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  REPAIR = 'REPAIR',
  CANCELLED = 'CANCELLED',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  SALES_REP = 'SALES_REP',
  AUTHORIZER = 'AUTHORIZER',
  CAD_DESIGNER = 'CAD_DESIGNER',
  SKU_MANAGER = 'SKU_MANAGER',
  FACTORY_MANAGER = 'FACTORY_MANAGER',
  STONE_MANAGER = 'STONE_MANAGER',
  SHIPPING_MANAGER = 'SHIPPING_MANAGER',
  US_SETTER = 'US_SETTER',
  CUSTOMER = 'CUSTOMER',
}

export interface Order {
  id: string;
  poNumber: string;
  kiraSkuNumber?: string;
  trackingNumber?: string;
  status: OrderStatus;
  manufacturingPath: 'STANDARD' | 'CASTING_ONLY';
  storeName?: string;
  customerFullName?: string;
  customerEmail?: string;
  orderType?: string;
  size?: string;
  metalType?: string;
  metalColor?: string;
  diamondType?: string;
  diamondQuality?: string;
  centerStoneShape?: string;
  approximateCaratWeight?: string;
  customerNotes?: string;
  quotedCost?: number;
  vendorName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  isInternal: boolean;
  mentions: string[];
  createdAt: string;
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  WAITING_CONFIRMATION: { label: 'Waiting Confirmation', color: '#F59E0B', bg: '#FEF3C7' },
  PENDING_CAD: { label: 'Pending CAD', color: '#8B5CF6', bg: '#EDE9FE' },
  CAD_IN_PROGRESS: { label: 'CAD In Progress', color: '#6366F1', bg: '#EEF2FF' },
  CUSTOMER_APPROVED: { label: 'Customer Approved', color: '#10B981', bg: '#D1FAE5' },
  CUSTOMER_REJECTED: { label: 'Customer Rejected', color: '#EF4444', bg: '#FEE2E2' },
  SKU_CREATION: { label: 'SKU Creation', color: '#F97316', bg: '#FFEDD5' },
  VPO_ISSUED: { label: 'VPO Issued', color: '#0EA5E9', bg: '#E0F2FE' },
  PENDING_CONTRACTOR: { label: 'Pending Contractor', color: '#F59E0B', bg: '#FEF3C7' },
  ORDER_JOB_BAG_CREATED: { label: 'Job Bag Created', color: '#14B8A6', bg: '#CCFBF1' },
  READY_TO_INVOICE: { label: 'Ready to Invoice', color: '#22C55E', bg: '#DCFCE7' },
  READY_TO_SHIP: { label: 'Ready to Ship', color: '#3B82F6', bg: '#DBEAFE' },
  SHIPPED: { label: 'Shipped', color: '#6366F1', bg: '#EEF2FF' },
  DELIVERED: { label: 'Delivered', color: '#10B981', bg: '#D1FAE5' },
  REPAIR: { label: 'Repair', color: '#EF4444', bg: '#FEE2E2' },
  CANCELLED: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
};
