import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum CadFileStatus {
  UPLOADED = 'UPLOADED',
  SENT_FOR_APPROVAL = 'SENT_FOR_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
}

@Entity('cad_files')
@Index(['orderId'])
export class CadFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column()
  originalName: string;

  @Column()
  fileName: string;

  @Column()
  filePath: string;

  // Resized derivative for image files only — used by list/card thumbnails
  // so they don't load the full-resolution original. Null for non-images.
  @Column({ nullable: true })
  thumbnailPath: string;

  @Column({ type: 'varchar', default: CadFileStatus.UPLOADED })
  status: CadFileStatus;

  @Column({ nullable: true })
  uploadedBy: string;

  @Column({ nullable: true })
  revisionNumber: number;

  @Column({ type: 'text', nullable: true })
  designerNotes: string;

  @Column({ type: 'text', nullable: true })
  customerFeedback: string;

  @Column({ nullable: true })
  approvedAt: Date;

  @Column({ nullable: true })
  approvedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
