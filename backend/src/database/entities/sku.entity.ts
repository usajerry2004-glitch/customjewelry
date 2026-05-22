import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('skus')
export class Sku {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  skuNumber: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  orderType: string;

  @Column({ nullable: true })
  metalType: string;

  @Column({ nullable: true })
  metalColor: string;

  @Column({ nullable: true })
  centerStoneShape: string;

  @Column({ nullable: true })
  approximateCaratWeight: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  generatedBy: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
