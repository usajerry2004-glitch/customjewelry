import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('order_events')
@Index(['orderId'])
@Index(['createdAt'])
export class OrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() orderId: string;
  @Column({ nullable: true }) userId: string;
  @Column() userEmail: string;
  @Column() action: string;
  @Column({ nullable: true }) fromStatus: string;
  @Column({ nullable: true }) toStatus: string;
  @Column({ type: 'text', nullable: true }) note: string;

  @CreateDateColumn() createdAt: Date;
}
