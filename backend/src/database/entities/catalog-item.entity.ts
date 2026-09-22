import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum CatalogItemKind {
  FACTORY = 'FACTORY',
  SUPPLY_SOURCE = 'SUPPLY_SOURCE',
  CAD_PERSON = 'CAD_PERSON',
}

// Admin-manageable list backing the "Factory" / "Stone Supplier" / "CAD
// Person" dropdowns across Settings, Orders, and the CAD upload forms — used
// to be two fixed TS enums (Factory, SupplySource in order.entity.ts) plus a
// hardcoded CAD_PERSON_OPTIONS array, which meant adding a new factory,
// supplier, or designer needed a code change. CatalogService seeds one row
// per original value on boot (see CatalogService.onModuleInit) so existing
// Order.assignedFactory/supplySource/CadFile.cadPersonName values keep
// matching, then grows via "+ Add Factory" / "+ Add Stone Supplier" / "+ Add
// CAD Person".
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
  // For CAD_PERSON this equals the label verbatim (not slugified) — that's
  // what's stored directly on CadFile.cadPersonName, unrelated code-vs-label
  // pairs would just be dead weight here.
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
