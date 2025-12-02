import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenaiService, FileData } from '../openai/openai.service';
import { Email } from '../google/entities/email.entity';
import { EmailAttachment } from '../google/entities/email-attachment.entity';
import { PaymentReport } from '../google/entities/payment-report.entity';

@Injectable()
export class EmailAnalysisService {
  constructor(
    private openaiService: OpenaiService,
    @InjectRepository(Email)
    private emailRepo: Repository<Email>,
    @InjectRepository(EmailAttachment)
    private attachmentRepo: Repository<EmailAttachment>,
    @InjectRepository(PaymentReport)
    private paymentReportRepo: Repository<PaymentReport>,
  ) {
    console.log('[EmailAnalysisService] Initialized');
  }

  /**
   * 단일 이메일 분석 → 결제 관련이면 PaymentReport 생성
   * @param force - true면 이미 분석된 이메일도 다시 분석
   */
  async analyzeEmail(emailId: number, force = false): Promise<{ email: Email; paymentReport?: PaymentReport }> {
    const email = await this.emailRepo.findOne({ 
      where: { id: emailId },
      relations: ['paymentReport'],
    });
    
    if (!email) {
      throw new Error('이메일을 찾을 수 없습니다.');
    }

    // 이미 분석된 경우 기존 결과 반환 (force가 아닐 때)
    if (!force && email.analyzedAt) {
      console.log(`[Payment Analysis] Already analyzed: ${emailId}`);
      return { email, paymentReport: email.paymentReport };
    }

    // 파일 수집: HTML 이미지 URL + 첨부파일 (이미지 + PDF)
    const files = await this.collectFiles(emailId, email.htmlBody, 5);

    // GPT로 이메일 분석 (이미지/PDF 포함)
    const analysis = await this.openaiService.analyzePaymentEmail({
      from: email.from,
      subject: email.subject,
      body: email.body || email.snippet,
      htmlBody: email.htmlBody,
      files,
    });

    // 분석 완료 시각 기록 (결제 여부 관계없이)
    email.analyzedAt = new Date();
    await this.emailRepo.save(email);

    // 결제 관련 이메일인 경우에만 PaymentReport 생성
    if (analysis.isPayment) {
      // 기존 리포트가 있으면 삭제 (force 재분석 시)
      if (email.paymentReport) {
        await this.paymentReportRepo.remove(email.paymentReport);
      }

      const paymentReport = this.paymentReportRepo.create({
        emailId: email.id,
        amount: analysis.amount,
        currency: analysis.currency,
        merchant: analysis.merchant,
        paymentDate: analysis.paymentDate ? new Date(analysis.paymentDate) : undefined,
        cardType: analysis.cardType,
        paymentType: analysis.paymentType,
        summary: analysis.summary,
        rawData: analysis,
      });

      await this.paymentReportRepo.save(paymentReport);
      console.log(`[Payment Analysis] Created report for email ${emailId}: ${analysis.merchant} - ${analysis.amount} ${analysis.currency || ''}`);
      
      return { email, paymentReport };
    }

    console.log(`[Payment Analysis] Not a payment email: ${emailId}`);
    return { email };
  }

  /**
   * 사용자의 미분석 이메일들 일괄 분석
   */
  async analyzeUserEmails(userId: number, options?: {
    limit?: number;
    force?: boolean;
  }): Promise<{ analyzed: number; payments: number; failed: number }> {
    const query = this.emailRepo.createQueryBuilder('email')
      .where('email.userId = :userId', { userId })
      .orderBy('email.receivedAt', 'DESC');

    // force가 아니면 analyzedAt이 null인 것만 (미분석 이메일만)
    if (!options?.force) {
      query.andWhere('email.analyzedAt IS NULL');
    }

    if (options?.limit) {
      query.take(options.limit);
    }

    const emails = await query.getMany();
    console.log(`[Payment Analysis] Found ${emails.length} emails to analyze for user ${userId}`);

    let analyzed = 0;
    let payments = 0;
    let failed = 0;

    for (const email of emails) {
      try {
        const result = await this.analyzeEmail(email.id, options?.force);
        analyzed++;
        if (result.paymentReport) {
          payments++;
        }
      } catch (error) {
        console.error(`[Payment Analysis] Failed for email ${email.id}:`, error.message);
        failed++;
      }
    }

    return { analyzed, payments, failed };
  }

  /**
   * 모든 사용자의 미분석 이메일 일괄 분석 (크론용)
   */
  async analyzeAllUsersEmails(options?: {
    limit?: number;
  }): Promise<{ totalAnalyzed: number; totalPayments: number; totalFailed: number }> {
    console.log('[Payment Analysis] Starting analysis for all users...');
    
    // 이메일이 있는 모든 사용자 ID 조회
    const userIds = await this.emailRepo
      .createQueryBuilder('email')
      .select('DISTINCT email.userId', 'userId')
      .getRawMany()
      .then(rows => rows.map(r => r.userId));
    
    let totalAnalyzed = 0;
    let totalPayments = 0;
    let totalFailed = 0;

    for (const userId of userIds) {
      try {
        const result = await this.analyzeUserEmails(userId, { 
          limit: options?.limit || 20,
        });
        totalAnalyzed += result.analyzed;
        totalPayments += result.payments;
        totalFailed += result.failed;
      } catch (err) {
        console.error(`[Payment Analysis] Failed for user ${userId}:`, err.message);
      }
    }

    console.log(`[Payment Analysis] All users completed - Analyzed: ${totalAnalyzed}, Payments: ${totalPayments}, Failed: ${totalFailed}`);
    return { totalAnalyzed, totalPayments, totalFailed };
  }

  /**
   * 사용자의 결제 리포트 조회 (기본)
   */
  async getUserPaymentReports(userId: number, options?: {
    limit?: number;
    offset?: number;
  }): Promise<PaymentReport[]> {
    const query = this.paymentReportRepo.createQueryBuilder('report')
      .innerJoinAndSelect('report.email', 'email')
      .where('email.userId = :userId', { userId })
      .orderBy('report.paymentDate', 'DESC');

    if (options?.limit) {
      query.take(options.limit);
    }

    if (options?.offset) {
      query.skip(options.offset);
    }

    return query.getMany();
  }

  /**
   * 사용자의 결제 리포트 페이지네이션 조회 (날짜 필터 포함)
   */
  async getUserPaymentReportsPaginated(userId: number, options: {
    page?: number;
    limit?: number;
    year?: number;
    month?: number;
    day?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    data: PaymentReport[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const query = this.paymentReportRepo.createQueryBuilder('report')
      .innerJoinAndSelect('report.email', 'email')
      .where('email.userId = :userId', { userId });

    // 날짜 필터: year, month, day
    if (options.year) {
      query.andWhere('EXTRACT(YEAR FROM report.paymentDate) = :year', { year: options.year });
    }
    if (options.month) {
      query.andWhere('EXTRACT(MONTH FROM report.paymentDate) = :month', { month: options.month });
    }
    if (options.day) {
      query.andWhere('EXTRACT(DAY FROM report.paymentDate) = :day', { day: options.day });
    }

    // 날짜 범위 필터: startDate, endDate
    if (options.startDate) {
      query.andWhere('report.paymentDate >= :startDate', { startDate: options.startDate });
    }
    if (options.endDate) {
      query.andWhere('report.paymentDate <= :endDate', { endDate: options.endDate });
    }

    // 전체 개수 조회
    const totalCount = await query.getCount();
    const totalPages = Math.ceil(totalCount / limit) || 1;

    // 데이터 조회
    const data = await query
      .orderBy('report.paymentDate', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return {
      data,
      totalCount,
      totalPages,
      currentPage: page,
      limit,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * 월별 결제 통계
   */
  async getMonthlyStats(userId: number, year: number): Promise<{
    month: number;
    totalAmount: number;
    count: number;
  }[]> {
    const result = await this.paymentReportRepo.createQueryBuilder('report')
      .innerJoin('report.email', 'email')
      .where('email.userId = :userId', { userId })
      .andWhere('EXTRACT(YEAR FROM report.paymentDate) = :year', { year })
      .select('EXTRACT(MONTH FROM report.paymentDate)', 'month')
      .addSelect('SUM(report.amount)', 'totalAmount')
      .addSelect('COUNT(*)', 'count')
      .groupBy('EXTRACT(MONTH FROM report.paymentDate)')
      .orderBy('month', 'ASC')
      .getRawMany();

    return result.map(r => ({
      month: parseInt(r.month),
      totalAmount: parseFloat(r.totalAmount) || 0,
      count: parseInt(r.count),
    }));
  }

  /**
   * 일별 결제 통계
   */
  async getDailyStats(userId: number, year: number, month: number): Promise<{
    day: number;
    totalAmount: number;
    count: number;
  }[]> {
    const result = await this.paymentReportRepo.createQueryBuilder('report')
      .innerJoin('report.email', 'email')
      .where('email.userId = :userId', { userId })
      .andWhere('EXTRACT(YEAR FROM report.paymentDate) = :year', { year })
      .andWhere('EXTRACT(MONTH FROM report.paymentDate) = :month', { month })
      .select('EXTRACT(DAY FROM report.paymentDate)', 'day')
      .addSelect('SUM(report.amount)', 'totalAmount')
      .addSelect('COUNT(*)', 'count')
      .groupBy('EXTRACT(DAY FROM report.paymentDate)')
      .orderBy('day', 'ASC')
      .getRawMany();

    return result.map(r => ({
      day: parseInt(r.day),
      totalAmount: parseFloat(r.totalAmount) || 0,
      count: parseInt(r.count),
    }));
  }

  /**
   * 단일 결제 리포트 조회
   */
  async getPaymentReport(reportId: number): Promise<PaymentReport | null> {
    return this.paymentReportRepo.findOne({
      where: { id: reportId },
      relations: ['email'],
    });
  }

  /**
   * 이메일의 결제 리포트 조회
   */
  async getPaymentReportByEmailId(emailId: number): Promise<PaymentReport | null> {
    return this.paymentReportRepo.findOne({
      where: { emailId },
      relations: ['email'],
    });
  }

  /**
   * 미분석 이메일 목록 조회 (큐에 넣기 위함)
   */
  async getUnanalyzedEmails(options?: {
    limit?: number;
  }): Promise<Email[]> {
    const query = this.emailRepo.createQueryBuilder('email')
      .where('email.analyzedAt IS NULL') // 아직 분석 안 된 이메일만
      .orderBy('email.receivedAt', 'DESC');

    if (options?.limit) {
      query.take(options.limit);
    }

    return query.getMany();
  }

  /**
   * 이메일에서 파일 수집 (HTML 이미지 URL + 첨부파일: 이미지 + PDF)
   */
  private async collectFiles(emailId: number, htmlBody: string | null, maxCount = 5): Promise<FileData[]> {
    const files: FileData[] = [];

    // 1. PDF 첨부파일 먼저 추가 (결제 정보가 PDF에 있을 확률이 높음)
    const pdfAttachments = await this.attachmentRepo.find({
      where: { 
        emailId,
        mimeType: 'application/pdf',
      },
      take: 3, // PDF는 최대 3개
    });

    for (const att of pdfAttachments) {
      if (files.length >= maxCount) break;
      
      // 너무 큰 PDF는 스킵 (10MB 이상)
      if (att.data && att.data.length > 10 * 1024 * 1024) {
        console.log(`[Payment Analysis] Skipping large PDF: ${att.filename} (${this.formatSize(att.data.length)})`);
        continue;
      }

      if (att.data) {
        files.push({
          type: 'base64',
          data: att.data.toString('base64'),
          mimeType: 'application/pdf',
          filename: att.filename,
        });
      }
    }
    console.log(`[Payment Analysis] Found ${files.length} PDF attachments`);

    // 2. HTML body에서 이미지 URL 추출 → 다운로드해서 base64로 변환
    if (htmlBody && files.length < maxCount) {
      const urlImages = this.extractImageUrlsFromHtml(htmlBody);
      for (const url of urlImages) {
        if (files.length >= maxCount) break;
        
        // 유효한 이미지 URL인지 확인 (http/https)
        if (url.startsWith('http://') || url.startsWith('https://')) {
          // 트래킹 픽셀이나 너무 작은 이미지 제외
          if (this.isLikelyContentImage(url)) {
            // URL 이미지를 다운로드해서 base64로 변환
            const downloaded = await this.downloadImageAsBase64(url);
            if (downloaded) {
              files.push(downloaded);
            }
          }
        }
      }
    }

    // 3. 첨부된 인라인 이미지 추가
    if (files.length < maxCount) {
      const imageAttachments = await this.attachmentRepo.find({
        where: { 
          emailId,
          isInline: true,
        },
        take: maxCount - files.length,
      });

      for (const att of imageAttachments) {
        if (files.length >= maxCount) break;
        
        // 이미지 타입만 처리
        if (!att.mimeType?.startsWith('image/')) continue;

        // 너무 큰 이미지는 스킵 (5MB 이상)
        if (att.data && att.data.length > 5 * 1024 * 1024) {
          console.log(`[Payment Analysis] Skipping large image: ${att.filename}`);
          continue;
        }

        if (att.data) {
          files.push({
            type: 'base64',
            data: att.data.toString('base64'),
            mimeType: att.mimeType,
            filename: att.filename,
          });
        }
      }
    }

    console.log(`[Payment Analysis] Total ${files.length} files collected for email ${emailId}`);
    return files;
  }

  /**
   * URL에서 이미지 다운로드 후 base64로 변환
   * CDN에서 차단되거나 실패 시 null 반환
   */
  private async downloadImageAsBase64(url: string): Promise<FileData | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.log(`[Payment Analysis] Image download failed (${response.status}): ${url.substring(0, 80)}...`);
        return null;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // 이미지가 아니면 스킵
      if (!contentType.startsWith('image/')) {
        console.log(`[Payment Analysis] Not an image (${contentType}): ${url.substring(0, 80)}...`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 너무 작은 이미지는 스킵 (1KB 미만 = 트래킹 픽셀 가능성)
      if (buffer.length < 1024) {
        console.log(`[Payment Analysis] Skipping tiny image (${buffer.length} bytes)`);
        return null;
      }

      // 너무 큰 이미지는 스킵 (5MB 이상)
      if (buffer.length > 5 * 1024 * 1024) {
        console.log(`[Payment Analysis] Skipping large image (${this.formatSize(buffer.length)})`);
        return null;
      }

      console.log(`[Payment Analysis] Downloaded image (${this.formatSize(buffer.length)}): ${url.substring(0, 50)}...`);
      
      return {
        type: 'base64',
        data: buffer.toString('base64'),
        mimeType: contentType,
      };
    } catch (error) {
      console.log(`[Payment Analysis] Image download error: ${error.message} - ${url.substring(0, 50)}...`);
      return null;
    }
  }

  /**
   * HTML에서 img 태그의 src URL 추출
   */
  private extractImageUrlsFromHtml(html: string): string[] {
    const urls: string[] = [];
    
    // <img src="..."> 패턴 매칭
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    
    while ((match = imgRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    }

    // background-image: url(...) 패턴도 체크
    const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
    while ((match = bgRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    }

    return urls;
  }

  /**
   * 실제 콘텐츠 이미지인지 판단 (트래킹 픽셀 제외)
   */
  private isLikelyContentImage(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    
    // 트래킹/분석 관련 URL 제외
    const trackingPatterns = [
      'pixel', 'track', 'beacon', 'analytics',
      'open.gif', '1x1', 'spacer', 'blank',
      'mailtrack', 'email-open', 'read-receipt',
    ];
    
    for (const pattern of trackingPatterns) {
      if (lowerUrl.includes(pattern)) {
        return false;
      }
    }

    // 이미지 확장자 확인
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const hasImageExtension = imageExtensions.some(ext => lowerUrl.includes(ext));
    
    // 이미지 확장자가 있거나, 일반적인 이미지 호스팅 패턴
    return hasImageExtension || 
           lowerUrl.includes('/image') || 
           lowerUrl.includes('/img') ||
           lowerUrl.includes('/photo');
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

