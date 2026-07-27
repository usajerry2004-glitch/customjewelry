import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

// One row = this user has muted bell notifications for this order. Checked in
// NotificationsService.create() before every notification is written, so it
// applies uniformly regardless of which flow triggered the notification.
@Entity('muted_order_notifications')
@Unique(['userId', 'orderId'])
@Index(['userId'])
export class MutedOrderNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  orderId: string;

  @CreateDateColumn()
  createdAt: Date;
}
