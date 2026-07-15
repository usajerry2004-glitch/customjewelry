import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// One row per start→stop work session a CAD designer logs against an order.
// Not surfaced anywhere in the app yet — this is purely the raw log a future
// weekly time report will be built from (total hours/days per order/designer).
@Entity('cad_time_logs')
@Index(['orderId'])
@Index(['userId'])
export class CadTimeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column()
  userId: string;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  stoppedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
