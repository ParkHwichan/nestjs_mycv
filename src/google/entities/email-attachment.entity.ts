import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  ManyToOne, 
  CreateDateColumn,
  JoinColumn,
  Index
} from 'typeorm';
import { Email } from './email.entity';

@Entity('email_attachments')
@Index(['emailId', 'attachmentId'], { unique: true }) // 중복 방지
export class EmailAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  emailId: number;

  @ManyToOne(() => Email, email => email.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emailId' })
  email: Email;

  @Column()
  attachmentId: string; // Gmail attachment ID

  @Column()
  filename: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ default: 0 })
  size: number;

  @Column({ nullable: true })
  contentId: string; // for inline images (cid:xxx)

  @Column({ default: false })
  isInline: boolean; // true if inline image

  @Column('bytea', { nullable: true })
  data: Buffer; // 파일 데이터 (PostgreSQL bytea)

  @CreateDateColumn()
  createdAt: Date;
}

