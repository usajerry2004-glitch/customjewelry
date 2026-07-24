import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum NotificationType {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_AUTHORIZED = 'ORDER_AUTHORIZED',
  CAD_UPLOADED = 'CAD_UPLOADED',
  CAD_SENT_FOR_APPROVAL = 'CAD_SENT_FOR_APPROVAL',
  CAD_APPROVED = 'CAD_APPROVED',
  CAD_REJECTED = 'CAD_REJECTED',
  SKU_GENERATED = 'SKU_GENERATED',
  ORDER_IN_MANUFACTURING = 'ORDER_IN_MANUFACTURING',
  ORDER_SHIPPED = 'ORDER_SHIPPED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  CUSTOMER_MESSAGE = 'CUSTOMER_MESSAGE',
  FACTORY_MESSAGE = 'FACTORY_MESSAGE',
  MENTION = 'MENTION',
  GENERAL = 'GENERAL',
  SLA_OVERDUE = 'SLA_OVERDUE',
  STONE_PENDING = 'STONE_PENDING',
  STONE_RECEIVED = 'STONE_RECEIVED',
}

@Entity('notifications')
@Index(['targetUserId'])
@Index(['targetUserId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', default: NotificationType.GENERAL })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  targetUserId: string;

  @Column({ default: false })
  isRead: boolean;

  // Snapshot of the order's priority flag at the moment this notification was
  // created — same denormalized-at-creation pattern as title/message, so it
  // still reflects "was this priority when it happened" even if the order's
  // flag changes later.
  @Column({ default: false })
  isPriority: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
