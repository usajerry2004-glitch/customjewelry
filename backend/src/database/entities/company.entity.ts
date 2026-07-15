import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// A company groups one or more Customer-role users (e.g. Griselda + her
// teammates) so they all see and act on the same set of orders. One Sales
// Rep per company — individual users no longer carry their own salesRepId
// once they belong to one; it's inherited from here.
@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  salesRepId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
