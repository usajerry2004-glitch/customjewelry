import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index, Unique } from 'typeorm';

// One row per (user, order) — the last time this user viewed the order's
// conversation. "Seen by" on a message is derived by comparing readers'
// lastReadAt against the message's createdAt, rather than storing a row per
// message per reader.
@Entity('order_conversation_reads')
@Unique(['userId', 'orderId'])
@Index(['orderId'])
export class OrderConversationRead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  orderId: string;

  @UpdateDateColumn()
  lastReadAt: Date;
}
