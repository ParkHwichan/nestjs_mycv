import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
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

  @Column('text', { nullable: true })
  summary: string; // GPT 요약

  @Column('simple-json', { nullable: true })
  rawData: Record<string, any>; // GPT가 추출한 원본 데이터

  @CreateDateColumn()
  createdAt: Date;
}

