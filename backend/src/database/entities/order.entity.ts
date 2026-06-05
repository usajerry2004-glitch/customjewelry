import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index
} from 'typeorm';

export enum OrderStatus {
  WAITING_CONFIRMATION = 'WAITING_CONFIRMATION',
  PENDING_CAD = 'PENDING_CAD',
  CAD_IN_PROGRESS = 'CAD_IN_PROGRESS',
  CUSTOMER_APPROVED = 'CUSTOMER_APPROVED',
  CUSTOMER_REJECTED = 'CUSTOMER_REJECTED',
  ORDER_REVISION = 'ORDER_REVISION',
  WAITING_FOR_PRICE = 'WAITING_FOR_PRICE',
  SKU_CREATION = 'SKU_CREATION',
  VPO_ISSUED = 'VPO_ISSUED',
  PENDING_CONTRACTOR = 'PENDING_CONTRACTOR',
  ORDER_JOB_BAG_CREATED = 'ORDER_JOB_BAG_CREATED',
  READY_TO_INVOICE = 'READY_TO_INVOICE',
  READY_TO_SHIP = 'READY_TO_SHIP',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  REPAIR = 'REPAIR',
  CANCELLED = 'CANCELLED',
}

export enum ManufacturingPath {
  STANDARD = 'STANDARD',
  CASTING_ONLY = 'CASTING_ONLY',
}

@Entity('orders')
@Index(['poNumber'], { unique: true })
@Index(['status'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  poNumber: string;

  @Column({ nullable: true })
  kiraSkuNumber: string;

  @Column({ nullable: true })
  trackingNumber: string;

  @Column({ type: 'varchar', default: OrderStatus.WAITING_CONFIRMATION })
  status: OrderStatus;

  @Column({ type: 'varchar', default: ManufacturingPath.STANDARD })
  manufacturingPath: ManufacturingPath;

  @Column({ nullable: true })
  customerId: string;

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

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  goldLockPrice: number;

  @Column({ nullable: true })
  invoiceNumber: string;

  @Column({ nullable: true })
  shipMethod: string;

  @Column({ nullable: true })
  courierName: string;

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

  @Column({ default: false })
  isArchived: boolean;

  @Column({ default: false })
  isPriorityCustomer: boolean;

  @Column({ default: false })
  sentToRc: boolean;

  @Column({ default: false })
  sentToCustomer: boolean;

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

  @Column({ nullable: true })
  smartsheetRowId: string;

  @Column({ type: 'text', nullable: true })
  aiSummary: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  processedDate: Date;
}
