import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index
} from 'typeorm';

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

export enum ManufacturingPath {
  STANDARD = 'STANDARD',
  CASTING_ONLY = 'CASTING_ONLY',
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

@Entity('orders')
@Index(['poNumber'], { unique: true })
@Index(['status'])
@Index(['customerId'])
@Index(['createdAt'])
@Index(['updatedAt'])
@Index(['cadSubStatus'])
@Index(['stoneStatus'])
@Index(['isPriorityCustomer'])
@Index(['status', 'isArchived'])
@Index(['isArchived'])
@Index(['salesRepId'])
@Index(['customerEmail'])
@Index(['companyId'])
@Index(['assignedFactory'])
@Index(['supplySource'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  poNumber: string;

  @Column({ unique: true, nullable: true })
  trackingToken: string;

  @Column({ nullable: true })
  kiraSkuNumber: string;

  @Column({ nullable: true })
  trackingNumber: string;

  @Column({ type: 'varchar', default: OrderStatus.CAD_IN_PROGRESS })
  status: OrderStatus;

  @Column({ type: 'varchar', default: ManufacturingPath.STANDARD })
  manufacturingPath: ManufacturingPath;

  @Column({ nullable: true })
  customerId: string;

  // Inherited from the placing customer's companyId at creation (same
  // denormalize-at-write pattern as salesRepName/salesRepEmail below) — this
  // is what lets any teammate at the same company see/act on this order,
  // not just whoever personally placed it.
  @Column({ nullable: true })
  companyId: string | null;

  @Column({ nullable: true })
  storeName: string;

  @Column({ nullable: true })
  customerFullName: string;

  @Column({ nullable: true })
  customerEmail: string;

  @Column({ nullable: true })
  salesRepEmail: string;

  @Column({ nullable: true })
  salesRepId: string;

  @Column({ nullable: true })
  salesRepName: string;

  @Column({ nullable: true })
  salesRepCode: string;

  @Column({ nullable: true })
  orderType: string;

  @Column({ nullable: true })
  size: string;

  @Column({ nullable: true })
  metalType: string;

  @Column({ nullable: true })
  metalColor: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ nullable: true })
  stamping: string;

  @Column({ nullable: true })
  diamondType: string;

  @Column({ nullable: true })
  diamondQuality: string;

  @Column({ nullable: true })
  centerStoneShape: string;

  @Column({ nullable: true })
  approximateCaratWeight: string;

  @Column({ nullable: true })
  centerStoneRatio: string;

  @Column({ nullable: true })
  referenceWeblink: string;

  @Column({ nullable: true })
  stockNumber: string;

  @Column({ type: 'text', nullable: true })
  customerNotes: string;

  @Column({ type: 'text', nullable: true })
  internalNotes: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  quotedCost: number;

  // Multiple price options offered to the customer (e.g. different metal/quality
  // tiers) while they decide — purely informational until Admin/Authorizer sets
  // the final quotedCost above.
  @Column({ type: 'jsonb', nullable: true })
  quoteOptions: { label: string; price: number }[] | null;

  // RightClick customer number this order bills to — required before a quoted
  // price can be saved. customerCodeName is denormalized at write time (see
  // salesRepName/salesRepEmail above) so the order tile/detail page never has
  // to join back to customer_codes just to render the label.
  @Column({ nullable: true })
  customerCode: string;

  @Column({ nullable: true })
  customerCodeName: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  goldLockPrice: number;

  @Column({ nullable: true })
  invoiceNumber: string;

  @Column({ nullable: true })
  shipMethod: string;

  @Column({ nullable: true })
  courierName: string;

  // Set by Admin/Authorizer once the order is approved (VPO issued or later).
  @Column({ type: 'date', nullable: true })
  committedShipDate: string;

  @Column({ nullable: true, type: 'text' })
  shippingNotes: string;

  @Column({ nullable: true })
  vendorName: string;

  @Column({ nullable: true })
  rcOrderNumber: string;

  @Column({ nullable: true })
  rcJobBagNumber: string;

  @Column({ nullable: true })
  rcVpoNumber: string;

  @Column({ type: 'text', nullable: true })
  vpoOrderDetails: string;

  @Column({ nullable: true })
  factoryStatus: string;

  @Column({ default: false })
  customerEmailApproval: boolean;

  @Column({ nullable: true, type: 'varchar' })
  cadSubStatus: string | null;

  @Column({ nullable: true })
  repairContractor: string;

  @Column({ type: 'varchar', nullable: true })
  stoneStatus: StoneStatus | null;

  // Who supplies the stone for this order — chosen by Admin/Authorizer via the
  // "Assign Supplier" step, after the VPO is issued. Stays null (invisible to any
  // Stone Manager) until then.
  @Column({ type: 'varchar', nullable: true })
  supplySource: SupplySource | null;

  // Which factory manufactures this order — chosen alongside supplySource via
  // "Assign Supplier". Stays null (invisible to any Factory Manager) until then.
  @Column({ type: 'varchar', nullable: true })
  assignedFactory: Factory | null;

  // When the order most recently entered VPO_ISSUED — the clock overdue alerts
  // count from (6 days for Factory Manager, 2 days for Stone Manager). Set on
  // approval and reset if Admin reverts from Manufactured back to VPO_ISSUED.
  @Column({ type: 'timestamp', nullable: true })
  vpoIssuedAt: Date | null;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ default: false })
  isPriorityCustomer: boolean;

  @Column({ default: false })
  sentToRc: boolean;

  @Column({ default: false })
  sentToCustomer: boolean;

  // When the customer was last emailed about the CAD approval — set on the initial
  // send and on each follow-up reminder; used to rate-limit the reminder button.
  @Column({ type: 'timestamp', nullable: true })
  lastApprovalEmailAt: Date | null;

  @Column({ nullable: true })
  headStyle: string;

  @Column({ nullable: true })
  shankStyle: string;

  @Column({ nullable: true })
  timeFrame: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  refCustomerPo: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  processedDate: Date;
}
