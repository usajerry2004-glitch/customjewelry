import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// One row per customer email reply to a follow-up email (approval check-in or
// feedback request) that EmailRepliesService picked up from the inbox. Also
// the dedupe record: a message is only ever processed once (messageId unique).
@Entity('email_replies')
@Index(['createdAt'])
export class EmailReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column() messageId: string;

  // 'APPROVAL_CHECKIN' | 'FEEDBACK'
  @Column({ type: 'varchar' }) kind: string;

  // 'APPLIED' — answer filled in automatically
  // 'NEEDS_REVIEW' — reply was unclear / off-topic / from an unexpected sender; admins alerted
  // 'IGNORED' — auto-reply, empty, or no matching order
  @Column({ type: 'varchar' }) outcome: string;

  @Column({ type: 'jsonb', default: () => "'[]'" }) orderIds: string[];
  @Column({ type: 'varchar', nullable: true }) fromEmail: string | null;
  @Column({ type: 'varchar', nullable: true }) subject: string | null;
  @Column({ type: 'text', nullable: true }) bodyText: string | null;
  @Column({ type: 'timestamp', nullable: true }) receivedAt: Date | null;
  // What the AI read from the reply, and/or why it went to review.
  @Column({ type: 'jsonb', nullable: true }) result: any;
  @Column({ type: 'text', nullable: true }) note: string | null;

  @CreateDateColumn() createdAt: Date;
}
