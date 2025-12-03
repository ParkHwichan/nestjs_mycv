import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/users.entity';

export type MailProvider = 'gmail' | 'yahoo' | 'outlook' | 'naver' | 'imap';

@Entity('mail_accounts')
@Index(['userId', 'email'], { unique: true }) // 사용자별 이메일 계정 중복 방지
export class MailAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, (user) => user.mailAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 20 })
  provider: MailProvider;

  @Column()
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  picture: string;

  @Column({ default: true })
  isActive: boolean;  // 계정 활성화 여부

  @Column({ default: false })
  needsReauth: boolean;  // 재인증 필요 여부

  // ==================== OAuth 전용 필드 (Gmail, Outlook) ====================
  @Column({ nullable: true })
  oauthId: string;  // Google ID, Microsoft ID 등

  @Column('text', { nullable: true })
  accessToken: string;

  @Column('text', { nullable: true })
  refreshToken: string;

  @Column('bigint', { nullable: true })
  expiresAt: number;  // timestamp

  @Column('text', { nullable: true })
  scope: string;

  // ==================== IMAP 전용 필드 (Yahoo, 네이버, 일반 IMAP) ====================
  @Column({ nullable: true })
  imapHost: string;  // imap.mail.yahoo.com, imap.naver.com

  @Column({ nullable: true })
  imapPort: number;  // 993

  @Column({ nullable: true })
  smtpHost: string;  // smtp.mail.yahoo.com

  @Column({ nullable: true })
  smtpPort: number;  // 465 or 587

  @Column({ nullable: true })
  imapUser: string;  // 로그인 아이디

  @Column('text', { nullable: true })
  imapPassword: string;  // 앱 비밀번호 (암호화 필요)

  @Column({ default: true })
  imapUseSsl: boolean;  // SSL/TLS 사용 여부

  // ==================== 동기화 관련 ====================
  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date;  // 마지막 동기화 시각

  @Column({ nullable: true })
  lastSyncError: string;  // 마지막 동기화 에러

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

