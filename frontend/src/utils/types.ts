export enum OrderStatus {
  CAD_IN_PROGRESS    = 'CAD_IN_PROGRESS',
  SKU_CREATION       = 'SKU_CREATION',
  VPO_ISSUED         = 'VPO_ISSUED',
  PENDING_CONTRACTOR = 'PENDING_CONTRACTOR',
  READY_TO_SHIP      = 'READY_TO_SHIP',
  SHIPPED            = 'SHIPPED',
  REPAIR             = 'REPAIR',
  COMPLETED          = 'COMPLETED',
  CANCELLED          = 'CANCELLED',
}

export enum StoneStatus {
  PENDING_STONE = 'PENDING_STONE',
  STONE_RECEIVED = 'STONE_RECEIVED',
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
  stoneStatus?: StoneStatus | null;
  repairContractor?: string;
  salesRepName?: string;
  salesRepEmail?: string;
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
  CAD_IN_PROGRESS:    { label: 'CAD In Progress',    color: '#6366F1', bg: '#EEF2FF' },
  SKU_CREATION:       { label: 'SKU Creation',       color: '#F97316', bg: '#FFEDD5' },
  VPO_ISSUED:         { label: 'VPO Created',        color: '#0EA5E9', bg: '#E0F2FE' },
  PENDING_CONTRACTOR: { label: 'Pending Contractor', color: '#F59E0B', bg: '#FEF3C7' },
  READY_TO_SHIP:      { label: 'Ready to Ship',      color: '#3B82F6', bg: '#DBEAFE' },
  SHIPPED:            { label: 'Shipped',            color: '#8B5CF6', bg: '#EDE9FE' },
  REPAIR:             { label: 'Repair',             color: '#EF4444', bg: '#FEE2E2' },
  COMPLETED:          { label: 'Completed',          color: '#10B981', bg: '#D1FAE5' },
  CANCELLED:          { label: 'Cancelled',          color: '#6B7280', bg: '#F3F4F6' },
};
