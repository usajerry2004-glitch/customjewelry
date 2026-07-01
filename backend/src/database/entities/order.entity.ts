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

@Entity('orders')
@Index(['poNumber'], { unique: true })
@Index(['status'])
@Index(['customerId'])
@Index(['createdAt'])
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

  @Column({ nullable: true })
  repairContractor: string;

  @Column({ type: 'varchar', nullable: true })
  stoneStatus: StoneStatus | null;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  processedDate: Date;
}
