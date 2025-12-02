import { ApiProperty } from '@nestjs/swagger';

export class AttachmentDto {
  @ApiProperty({ example: 1, description: '첨부파일 ID' })
  id: number;

  @ApiProperty({ example: 'receipt.pdf', description: '파일명' })
  filename: string;

  @ApiProperty({ example: 'application/pdf', description: 'MIME 타입' })
  mimeType: string;

  @ApiProperty({ example: 12345, description: '파일 크기 (bytes)' })
  size: number;

  @ApiProperty({ example: false, description: '인라인 이미지 여부' })
  isInline: boolean;

  @ApiProperty({ example: '/google/attachments/1', description: '다운로드 URL' })
  url: string;
}

export class PaymentReportDto {
  @ApiProperty({ example: 1, description: '리포트 ID' })
  id: number;

  @ApiProperty({ example: 123, description: '이메일 ID' })
  emailId: number;

  @ApiProperty({ example: '18abc123def456', description: 'Gmail 메시지 ID' })
  messageId: string;

  @ApiProperty({ 
    example: 'https://mail.google.com/mail/u/0/#inbox/18abc123def456', 
    description: 'Gmail 웹 링크',
    nullable: true 
  })
  gmailUrl: string;

  @ApiProperty({ example: true, description: '결제 관련 이메일 여부' })
  isPayment: boolean;

  @ApiProperty({ example: 'AT&T payment processed', description: '이메일 제목' })
  subject: string;

  @ApiProperty({ example: 'AT&T <noreply@att.com>', description: '발신자' })
  from: string;

  @ApiProperty({ example: 'Your payment has been processed...', description: '본문 텍스트', nullable: true })
  body: string;

  @ApiProperty({ example: '<html>...</html>', description: 'HTML 본문', nullable: true })
  htmlBody: string;

  @ApiProperty({ type: [AttachmentDto], description: '첨부파일 목록' })
  attachments: AttachmentDto[];

  @ApiProperty({ example: 127.76, description: '결제 금액', nullable: true })
  amount: number;

  @ApiProperty({ example: 'USD', description: '통화 코드 (ISO 4217)', nullable: true })
  currency: string;

  @ApiProperty({ example: 'AT&T', description: '결제처/가맹점', nullable: true })
  merchant: string;

  @ApiProperty({ example: '2025-09-12', description: '결제일', nullable: true })
  paymentDate: Date;

  @ApiProperty({ example: 'Visa', description: '카드 종류', nullable: true })
  cardType: string;

  @ApiProperty({ 
    example: 'autopay', 
    description: '결제 유형',
    enum: ['card_online', 'card_offline', 'subscription', 'autopay', 'transfer', 'mobile', 'other'],
    nullable: true 
  })
  paymentType: string;

  @ApiProperty({ 
    example: 'living', 
    description: '소비 카테고리',
    enum: ['transport', 'living', 'hobby', 'other'],
    nullable: true 
  })
  category: string;

  @ApiProperty({ example: 'AT&T 통신비 $127.76 자동결제 완료', description: 'GPT 요약' })
  summary: string;

  @ApiProperty({ example: '2025-12-02T10:30:00Z', description: '생성일' })
  createdAt: Date;
}

export class PaymentReportListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 100, description: '전체 개수' })
  totalCount: number;

  @ApiProperty({ example: 5, description: '전체 페이지 수' })
  totalPages: number;

  @ApiProperty({ example: 1, description: '현재 페이지' })
  currentPage: number;

  @ApiProperty({ example: 20, description: '페이지당 개수' })
  limit: number;

  @ApiProperty({ example: true, description: '다음 페이지 존재 여부' })
  hasNext: boolean;

  @ApiProperty({ example: false, description: '이전 페이지 존재 여부' })
  hasPrev: boolean;

  @ApiProperty({ type: [PaymentReportDto], description: '결제 리포트 목록' })
  data: PaymentReportDto[];
}

