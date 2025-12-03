import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  ManyToOne, 
  OneToMany,
  OneToOne,
  CreateDateColumn, 
  Index,
  JoinColumn
} from 'typeorm';
import { User } from '../../users/users.entity';
import { EmailAttachment } from './email-attachment.entity';
import { PaymentReport } from './payment-report.entity';
import { MailAccount } from '../../mail/entities/mail-account.entity';

@Entity('emails')
@Index(['mailAccountId', 'messageId'], { unique: true }) // 계정별 메일 중복 방지
export class Email {
  @PrimaryGeneratedColumn()
  id: number;

  // ==================== 기존 userId (마이그레이션 호환용) ====================
  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // ==================== 새로운 메일 계정 연결 ====================
  @Column({ nullable: true })  // 마이그레이션 기간 동안 nullable
  @Index()
  mailAccountId: number;

  @ManyToOne(() => MailAccount, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'mailAccountId' })
  mailAccount: MailAccount;

  @Column()
  @Index()
  messageId: string; // Gmail/Yahoo/etc message ID

  @Column()
  threadId: string;

  @Column({ nullable: true })
  from: string;

  @Column({ nullable: true })
  to: string;

  @Column({ nullable: true })
  cc: string;

  @Column({ nullable: true })
  subject: string;

  @Column('text', { nullable: true })
  body: string; // plain text

  @Column('text', { nullable: true })
  htmlBody: string; // HTML

  @Column('text', { nullable: true })
  searchText: string; // 검색용 텍스트 (subject + from + body + htmlBody 정제)

  @Column({ nullable: true })
  snippet: string;

  @Column('simple-json', { nullable: true })
  labelIds: string[]; // ['INBOX', 'UNREAD', ...]

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date; // 메일 수신 시각

  @Column({ default: false })
  isRead: boolean;

  @Column({ default: false })
  hasAttachments: boolean;

  @Column({ default: false })
  hasImages: boolean;

  @OneToMany(() => EmailAttachment, attachment => attachment.email, { cascade: true })
  attachments: EmailAttachment[];

  @OneToOne(() => PaymentReport, report => report.email)
  paymentReport: PaymentReport; // 결제 관련 이메일인 경우에만 존재

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  analyzedAt: Date; // GPT 분석 완료 시각 (결제 여부 관계없이)

  @CreateDateColumn()
  syncedAt: Date; // DB에 저장된 시각
}

