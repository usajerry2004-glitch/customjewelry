export enum OrderStatus {
  NEW             = 'NEW',
  CAD_IN_PROGRESS = 'CAD_IN_PROGRESS',
  VPO_ISSUED      = 'VPO_ISSUED',
  MANUFACTURED    = 'MANUFACTURED',
  SHIPPED         = 'SHIPPED',
  REPAIR          = 'REPAIR',
  COMPLETED       = 'COMPLETED',
  CANCELLED       = 'CANCELLED',
}

export enum StoneStatus {
  PENDING_STONE = 'PENDING_STONE',
  STONE_RECEIVED = 'STONE_RECEIVED',
}

export enum SupplySource {
  STONE_CREATIONS = 'STONE_CREATIONS',
  KIRA            = 'KIRA',
}

export enum Factory {
  KAMA_JEWELRY   = 'KAMA_JEWELRY',
  CREATIONS      = 'CREATIONS',
  UNIQUE_DESIGNS = 'UNIQUE_DESIGNS',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  SALES_REP = 'SALES_REP',
  AUTHORIZER = 'AUTHORIZER',
  CAD_DESIGNER = 'CAD_DESIGNER',
  FACTORY_MANAGER = 'FACTORY_MANAGER',
  STONE_MANAGER = 'STONE_MANAGER',
  CUSTOMER = 'CUSTOMER',
}

export interface Order {
  id: string;
  poNumber: string;
  kiraSkuNumber?: string;
  trackingNumber?: string;
  status: OrderStatus;
  cadSubStatus?: string | null;
  sentToCustomer?: boolean;
  lastApprovalEmailAt?: string | null;
  manufacturingPath: 'STANDARD' | 'CASTING_ONLY';
  storeName?: string;
  customerFullName?: string;
  customerEmail?: string;
  phoneNumber?: string;
  orderType?: string;
  size?: string;
  metalType?: string;
  metalColor?: string;
  diamondType?: string;
  diamondQuality?: string;
  centerStoneShape?: string;
  approximateCaratWeight?: string;
  customerNotes?: string;
  refCustomerPo?: string;
  quotedCost?: number;
  quoteOptions?: { label: string; price: number }[] | null;
  committedShipDate?: string | null;
  vendorName?: string;
  stoneStatus?: StoneStatus | null;
  supplySource?: SupplySource | null;
  assignedFactory?: Factory | null;
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
  mentionNames?: string[];
  mentions: string[];
  createdAt: string;
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NEW:             { label: 'New',           color: '#EC4899', bg: '#FCE7F3' },
  CAD_IN_PROGRESS: { label: 'CAD In Progress', color: '#6366F1', bg: '#EEF2FF' },
  VPO_ISSUED:      { label: 'VPO Issued',    color: '#0EA5E9', bg: '#E0F2FE' },
  MANUFACTURED:    { label: 'Manufactured',  color: '#8B5CF6', bg: '#EDE9FE' },
  SHIPPED:         { label: 'Shipped',       color: '#3B82F6', bg: '#DBEAFE' },
  REPAIR:          { label: 'Repair',        color: '#EF4444', bg: '#FEE2E2' },
  COMPLETED:       { label: 'Completed',     color: '#10B981', bg: '#D1FAE5' },
  CANCELLED:       { label: 'Cancelled',     color: '#6B7280', bg: '#F3F4F6' },
};

export const SUPPLY_SOURCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  STONE_CREATIONS: { label: 'Stone Creations Supply', color: '#B45309', bg: '#FEF3C7' },
  KIRA:            { label: 'Kira Supply',            color: '#9333EA', bg: '#F3E8FF' },
};

export const FACTORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  KAMA_JEWELRY:   { label: 'Kama Jewelry',   color: '#0EA5E9', bg: '#E0F2FE' },
  CREATIONS:      { label: 'Creations',      color: '#B45309', bg: '#FEF3C7' },
  UNIQUE_DESIGNS: { label: 'Unique Designs', color: '#059669', bg: '#D1FAE5' },
};

export const ROLE_ACTION_COLOR: Record<string, string> = {
  ADMIN:           '#C09B58',
  AUTHORIZER:      '#F59E0B',
  CAD_DESIGNER:    '#6366F1',
  STONE_MANAGER:   '#9333EA',
  FACTORY_MANAGER: '#0D9488',
  CUSTOMER:        '#059669',
  SALES_REP:       '#8B5CF6',
};

export function needsActionFromRole(order: Partial<Order> & { cadSubStatus?: string | null; sentToCustomer?: boolean; stoneStatus?: string | null }, role: string): boolean {
  switch (role) {
    case 'ADMIN':
    case 'AUTHORIZER':
      if (order.status === OrderStatus.NEW) return true;
      if (order.status === OrderStatus.CAD_IN_PROGRESS && order.cadSubStatus === 'UPLOADED' && !order.quotedCost) return true;
      if (order.status === OrderStatus.MANUFACTURED) return true;
      return false;
    case 'CAD_DESIGNER':
      if (order.status === OrderStatus.CAD_IN_PROGRESS && !order.cadSubStatus) return true;
      if (order.status === OrderStatus.CAD_IN_PROGRESS && order.cadSubStatus === 'REVISION') return true;
      return false;
    case 'STONE_MANAGER':
      return order.status === OrderStatus.VPO_ISSUED && (!order.stoneStatus || order.stoneStatus === 'PENDING_STONE');
    case 'FACTORY_MANAGER':
      return order.status === OrderStatus.VPO_ISSUED && order.stoneStatus === 'STONE_RECEIVED';
    case 'CUSTOMER':
      return order.status === OrderStatus.CAD_IN_PROGRESS && order.sentToCustomer === true;
    default:
      return false;
  }
}

// For orders in CAD_IN_PROGRESS, a sub-label reflects the actual stage
export function getCadSubLabel(order: { cadSubStatus?: string | null; sentToCustomer?: boolean; quotedCost?: number | null }): string | null {
  if (!order.cadSubStatus) return 'Pending CAD';
  if (order.cadSubStatus === 'REVISION') return 'Revision';
  if (order.cadSubStatus === 'REJECTED') return 'Rejected';
  if (order.cadSubStatus === 'UPLOADED') {
    if (order.sentToCustomer) return 'Awaiting Approval';
    return 'Awaiting Quote';
  }
  return null;
}
