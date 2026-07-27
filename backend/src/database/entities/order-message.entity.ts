import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('order_messages')
@Index(['orderId'])
export class OrderMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column()
  authorId: string;

  @Column()
  authorName: string;

  @Column()
  authorRole: string;

  @Column('text')
  content: string;

  @Column({ default: false })
  isInternal: boolean;

  @Column('simple-array', { nullable: true, default: '' })
  mentions: string[];

  // Threaded replies — the message this one is quoting/replying to, if any.
  @Column({ nullable: true })
  parentMessageId: string | null;

  @Column({ nullable: true })
  attachmentUrl: string;

  @Column({ nullable: true })
  attachmentName: string;

  @Column({ nullable: true })
  attachmentSize: number;

  @Column({ nullable: true })
  attachmentMimeType: string;

  @CreateDateColumn()
  createdAt: Date;
}
