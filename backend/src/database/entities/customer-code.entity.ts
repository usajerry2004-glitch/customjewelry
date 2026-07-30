import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// RightClick customer number list — imported from the "Rightclick Customer
// List" export (see database/seeds/import-customer-codes.ts). Admin selects
// one of these when saving a quoted price on an order.
@Entity('customer_codes')
export class CustomerCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
