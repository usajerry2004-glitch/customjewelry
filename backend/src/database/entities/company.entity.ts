import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// A company groups one or more Customer-role users (e.g. Griselda + her
// teammates) so they all see and act on the same set of orders. One Sales
// Rep per company — individual users no longer carry their own salesRepId
// once they belong to one; it's inherited from here.
@Entity('companies')
@Index(['salesRepId'])
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  salesRepId: string | null;

  // Gates the (currently placeholder) interactive 3D/AR viewer on this
  // company's orders — Admin-toggled per company, not per individual order,
  // since it's meant as a company-wide perk rather than a per-order add-on.
  @Column({ default: false })
  viewerAccessEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
