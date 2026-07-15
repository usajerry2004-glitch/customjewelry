import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index
} from 'typeorm';
import { Factory, SupplySource } from './order.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  SALES_REP = 'SALES_REP',
  AUTHORIZER = 'AUTHORIZER',
  CAD_DESIGNER = 'CAD_DESIGNER',
  FACTORY_MANAGER = 'FACTORY_MANAGER',
  STONE_MANAGER = 'STONE_MANAGER',
  CUSTOMER = 'CUSTOMER',
}

@Entity('users')
@Index(['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'varchar', default: UserRole.SALES_REP })
  role: UserRole;

  @Column({ nullable: true })
  department: string;

  @Column({ nullable: true })
  storeName: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  salesRepId: string;

  // Which factory this account manages orders for (FACTORY_MANAGER role) — only
  // orders assigned to this same factory are visible to them.
  @Column({ type: 'varchar', nullable: true })
  assignedFactory: Factory | null;

  // Which stone supply source this account manages orders for (STONE_MANAGER role).
  // A single account may hold both an assignedFactory and an assignedSupplySource
  // (e.g. a factory that also supplies its own stones).
  @Column({ type: 'varchar', nullable: true })
  assignedSupplySource: SupplySource | null;

  @Column({ default: true })
  isActive: boolean;

  // When false, this account is excluded from every outgoing notification
  // email (still gets in-app notifications) — set per-person, e.g. someone
  // who wants to stop being CC'd on every step without losing their role.
  @Column({ default: true })
  emailNotificationsEnabled: boolean;

  @Column({ default: false })
  isPriority: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true, select: false })
  otpCodeHash: string;

  @Column({ nullable: true })
  otpExpiresAt: Date;

  @Column({ default: 0 })
  otpAttempts: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
