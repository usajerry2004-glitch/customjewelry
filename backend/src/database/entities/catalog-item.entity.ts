import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum CatalogItemKind {
  FACTORY = 'FACTORY',
  SUPPLY_SOURCE = 'SUPPLY_SOURCE',
}

// Admin-manageable list backing the "Factory" / "Stone Supplier" dropdowns
// across Settings and Orders — used to be two fixed TS enums (Factory,
// SupplySource in order.entity.ts), which meant adding a new factory or
// supplier needed a code change. CatalogService seeds one row per original
// enum value on boot (see CatalogService.onModuleInit) so existing
// Order.assignedFactory/supplySource values keep matching, then grows via
// Settings > "+ Add Factory" / "+ Add Stone Supplier".
@Entity('catalog_items')
@Index(['kind', 'key'], { unique: true })
export class CatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  kind: CatalogItemKind;

  // Stable identifier stored on Order.assignedFactory / Order.supplySource /
  // User.assignedFactory / User.assignedSupplySource — set once at creation
  // (derived from the label an Admin typed in) and never changed afterward,
  // even if label is edited later, so existing orders/accounts keep resolving.
  @Column()
  key: string;

  @Column()
  label: string;

  // Soft-hide instead of delete — orders/accounts may already reference this
  // key, and hiding it from future selection shouldn't break their history.
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
