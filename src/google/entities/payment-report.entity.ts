import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Email } from './email.entity';

@Entity('payment_reports')
export class PaymentReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index({ unique: true })
  emailId: number;

  @OneToOne(() => Email, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emailId' })
  email: Email;

  // 중복 감지 관련 필드
  @Column({ default: false })
  @Index()
  isDuplicate: boolean; // 중복 결제인지 여부

  @Column({ nullable: true })
  @Index()
  primaryReportId: number; // 중복인 경우, 원본(대표) 리포트 ID

  @ManyToOne(() => PaymentReport, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primaryReportId' })
  primaryReport: PaymentReport; // 원본 리포트 참조

  @Column({ default: false })
  @Index()
  isPayment: boolean; // 결제 관련 이메일인지 여부

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: number; // 결제 금액

  @Column({ length: 10, nullable: true })
  currency: string; // 통화 (KRW, USD, EUR 등)

  @Column({ nullable: true })
  merchant: string; // 결제처/가맹점

  @Column({ type: 'timestamp', nullable: true })
  paymentDate: Date; // 결제일

  @Column({ nullable: true })
  cardType: string; // 카드 종류

  @Column({ nullable: true })
  paymentType: string; // 결제 유형 (온라인/오프라인/구독 등)

  @Column({ length: 20, nullable: true })
  @Index()
  category: string; // 소비 카테고리 (transport, living, hobby, other)

  @Column('text', { nullable: true })
  summary: string; // GPT 요약

  @Column('simple-json', { nullable: true })
  rawData: Record<string, any>; // GPT가 추출한 원본 데이터

  @CreateDateColumn()
  createdAt: Date;
}

