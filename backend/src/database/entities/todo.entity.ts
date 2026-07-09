import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TodoPriority {
  LOW    = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH   = 'HIGH',
}

@Entity('todos')
@Index(['userId', 'createdAt'])
export class Todo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  title: string;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ type: 'varchar', default: TodoPriority.MEDIUM })
  priority: TodoPriority;

  @Column({ nullable: true, type: 'date' })
  dueDate: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
