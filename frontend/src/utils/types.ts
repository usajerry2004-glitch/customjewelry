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
  KIRA_JEWELS_USA = 'KIRA_JEWELS_USA',
}

export enum Factory {
  KAMA_JEWELRY   = 'KAMA_JEWELRY',
  CREATIONS      = 'CREATIONS',
  UNIQUE_DESIGNS = 'UNIQUE_DESIGNS',
  JEWEL_ONE      = 'JEWEL_ONE',
}

// Set once at order creation (not editable afterward) — flags that this order
// doesn't need a full stone-setting job, so Factory and Stone Manager both
// know what to expect before they open it.
export const MOUNTING_OPTIONS = ['Mounting Only', 'Semi-Mount'] as const;

// Per-user permission overrides — mirrors backend/src/common/permissions.ts.
export enum Permission {
  ASSIGN_SUPPLIER = 'ASSIGN_SUPPLIER',
  BULK_DELETE_ORDERS = 'BULK_DELETE_ORDERS',
  BULK_STATUS_NUDGE = 'BULK_STATUS_NUDGE',
  MARK_STONE_RECEIVED = 'MARK_STONE_RECEIVED',
}

export const PERMISSION_LABELS: Record<string, string> = {
  [Permission.ASSIGN_SUPPLIER]: 'Assign factory / stone supplier to orders',
  [Permission.BULK_DELETE_ORDERS]: 'Permanently delete orders',
  [Permission.BULK_STATUS_NUDGE]: 'Bulk-move orders between stages',
  [Permission.MARK_STONE_RECEIVED]: 'Mark Stone Creations-supplied orders as stone received, even ones manufactured at a different factory',
};

export enum UserRole {
  ADMIN = 'ADMIN',
  SALES_REP = 'SALES_REP',
  AUTHORIZER = 'AUTHORIZER',
  CAD_DESIGNER = 'CAD_DESIGNER',
  FACTORY_MANAGER = 'FACTORY_MANAGER',
  FACTORY_VIEWER = 'FACTORY_VIEWER',
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
  customerEmailApproval?: boolean;
  lastApprovalEmailAt?: string | null;
  approvalStallSurveySentAt?: string | null;
  approvalStallReminderSentAt?: string | null;
  approvalStallReason?: string | null;
  approvalStallSubReason?: string | null;
  approvalStallRespondedAt?: string | null;
  feedbackRequestedAt?: string | null;
  feedbackRespondedAt?: string | null;
  feedbackExperienceRating?: number | null;
  feedbackPriceRating?: number | null;
  feedbackQualityRating?: number | null;
  feedbackComments?: string | null;
  manufacturingPath: 'STANDARD' | 'CASTING_ONLY';
  storeName?: string;
  customerFullName?: string;
  customerEmail?: string;
  phoneNumber?: string;
  orderType?: string;
  size?: string;
  metalType?: string;
  metalColor?: string;
  quantity?: number;
  stamping?: string;
  diamondType?: string;
  diamondQuality?: string;
  mountingOption?: string | null;
  centerStoneShape?: string;
  approximateCaratWeight?: string;
  hasGemstone?: boolean;
  customerNotes?: string;
  refCustomerPo?: string;
  quotedCost?: number;
  quoteOptions?: { label: string; price: number }[] | null;
  customerCode?: string | null;
  customerCodeName?: string | null;
  committedShipDate?: string | null;
  shippedDate?: string | null;
  shipMethod?: string | null;
  qcDone?: boolean;
  vendorName?: string;
  stoneStatus?: StoneStatus | null;
  supplySource?: SupplySource | null;
  assignedFactory?: Factory | null;
  isPriorityCustomer?: boolean;
  repairContractor?: string;
  salesRepName?: string;
  salesRepEmail?: string;
  companyId?: string | null;
  companyViewerAccessEnabled?: boolean;
  source?: string;
  externalOrderId?: string | null;
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
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentMimeType?: string | null;
  parentMessageId?: string | null;
  parentPreview?: { id: string; authorName: string; content: string } | null;
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
  STONE_CREATIONS: { label: 'Creations',      color: '#B45309', bg: '#FEF3C7' },
  KIRA:            { label: 'Kira',           color: '#9333EA', bg: '#F3E8FF' },
  KIRA_JEWELS_USA: { label: 'Kira Jewels Usa', color: '#0D9488', bg: '#CCFBF1' },
};

export const FACTORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  KAMA_JEWELRY:   { label: 'Kama Jewelry',   color: '#0EA5E9', bg: '#E0F2FE' },
  CREATIONS:      { label: 'Creations',      color: '#B45309', bg: '#FEF3C7' },
  UNIQUE_DESIGNS: { label: 'Unique Designs', color: '#059669', bg: '#D1FAE5' },
  JEWEL_ONE:      { label: 'Jewel One',      color: '#7C3AED', bg: '#EDE9FE' },
};

// Bold/high-contrast on purpose — this needs to jump out at both Factory and
// Stone Manager, same as the ★ Priority badge, since it changes what work
// they should expect on the order.
export const MOUNTING_OPTION_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  'Mounting Only': { label: 'Mounting Only', icon: '⚙️', color: '#9A3412', bg: '#FFEDD5' },
  'Semi-Mount':    { label: 'Semi-Mount',    icon: '◐',  color: '#9A3412', bg: '#FFEDD5' },
};

// Friendlier phrasing for the customer portal only — "VPO Issued" is real
// internal operational terminology staff use daily and should keep seeing
// on the internal dashboard (which reads STATUS_CONFIG directly); customers
// just need to know their order is being made.
export const CUSTOMER_STATUS_LABEL_OVERRIDES: Record<string, string> = {
  VPO_ISSUED: 'In Production',
};

export function customerStatusLabel(status?: string | null): string {
  if (!status) return '';
  return CUSTOMER_STATUS_LABEL_OVERRIDES[status] || STATUS_CONFIG[status]?.label || status;
}

// For orders in CAD_IN_PROGRESS, a sub-label reflects the actual stage
export function getCadSubLabel(order: { cadSubStatus?: string | null; sentToCustomer?: boolean; quotedCost?: number | null }): string | null {
  // sentToCustomer is the authoritative "the customer can see this" signal — trust it even
  // if cadSubStatus is missing/stale (e.g. a manual file-status fix that skipped that field).
  if (order.sentToCustomer) return 'Awaiting Approval';
  if (!order.cadSubStatus) return 'Pending CAD';
  if (order.cadSubStatus === 'REVISION') return 'Revision';
  if (order.cadSubStatus === 'REJECTED') return 'Rejected';
  if (order.cadSubStatus === 'UPLOADED') return 'Awaiting Quote';
  return null;
}
