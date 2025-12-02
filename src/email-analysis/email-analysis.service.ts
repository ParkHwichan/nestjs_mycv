import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import imageSize from 'image-size';
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
   * 단일 이메일 분석 → PaymentReport 생성 (결제 여부 관계없이)
   * @param force - true면 이미 분석된 이메일도 다시 분석
   */
  async analyzeEmail(emailId: number, force = false): Promise<{ email: Email; paymentReport: PaymentReport }> {
    const email = await this.emailRepo.findOne({ 
      where: { id: emailId },
      relations: ['paymentReport'],
    });
    
    if (!email) {
      throw new Error('이메일을 찾을 수 없습니다.');
    }

    // 이미 분석된 경우 기존 결과 반환 (force가 아닐 때)
    if (!force && email.paymentReport) {
      console.log(`[Email Analysis] Already analyzed: ${emailId}`);
      return { email, paymentReport: email.paymentReport };
    }

    // 파일 수집: HTML 이미지 URL + 첨부파일 (이미지 + PDF, 200x200 이상만)
    const files = await this.collectFiles(emailId, email.htmlBody);

    // GPT로 이메일 분석 (이미지/PDF 포함)
    const analysis = await this.openaiService.analyzePaymentEmail({
      from: email.from,
      subject: email.subject,
      body: email.body || email.snippet,
      htmlBody: email.htmlBody,
      files,
    });

    // 기존 리포트가 있으면 삭제 (force 재분석 시)
    if (email.paymentReport) {
      await this.paymentReportRepo.remove(email.paymentReport);
    }

    // PaymentReport 생성 (결제 여부 관계없이)
    // paymentDate가 없으면 이메일 수신 시점 사용
    const paymentDate = analysis.isPayment 
      ? (analysis.paymentDate ? new Date(analysis.paymentDate) : email.receivedAt)
      : undefined;

    const paymentReport = this.paymentReportRepo.create({
      emailId: email.id,
      isPayment: analysis.isPayment,
      amount: analysis.isPayment ? analysis.amount : undefined,
      currency: analysis.isPayment ? analysis.currency : undefined,
      merchant: analysis.isPayment ? analysis.merchant : undefined,
      paymentDate,
      cardType: analysis.isPayment ? analysis.cardType : undefined,
      paymentType: analysis.isPayment ? analysis.paymentType : undefined,
      category: analysis.isPayment ? analysis.category : undefined,
      summary: analysis.summary,
      rawData: analysis,
    });

    await this.paymentReportRepo.save(paymentReport);
    
    if (analysis.isPayment) {
      console.log(`[Email Analysis] Payment: ${emailId} - ${analysis.merchant} ${analysis.amount} ${analysis.currency || ''} [${analysis.category || 'other'}]`);
    } else {
      console.log(`[Email Analysis] Not payment: ${emailId}`);
    }
    
    return { email, paymentReport };
  }

  /**
   * 사용자의 미분석 이메일들 일괄 분석
   */
  async analyzeUserEmails(userId: number, options?: {
    limit?: number;
    force?: boolean;
  }): Promise<{ analyzed: number; payments: number; failed: number }> {
    const query = this.emailRepo.createQueryBuilder('email')
      .leftJoin('email.paymentReport', 'report')
      .where('email.userId = :userId', { userId })
      .orderBy('email.receivedAt', 'DESC');

    // force가 아니면 PaymentReport가 없는 것만 (미분석 이메일만)
    if (!options?.force) {
      query.andWhere('report.id IS NULL');
    }

    if (options?.limit) {
      query.take(options.limit);
    }

    const emails = await query.getMany();
    console.log(`[Email Analysis] Found ${emails.length} emails to analyze for user ${userId}`);

    let analyzed = 0;
    let payments = 0;
    let failed = 0;

    for (const email of emails) {
      try {
        const result = await this.analyzeEmail(email.id, options?.force);
        analyzed++;
        if (result.paymentReport?.isPayment) {
          payments++;
        }
      } catch (error) {
        console.error(`[Email Analysis] Failed for email ${email.id}:`, error.message);
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
    search?: string;
    category?: string;
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
      .leftJoinAndSelect('email.attachments', 'attachments')
      .where('email.userId = :userId', { userId });

    // 결제 리포트만 조회 (isPayment = true, 중복 제외)
    query.andWhere('report.isPayment = :isPayment', { isPayment: true });
    query.andWhere('report.isDuplicate = :isDuplicate', { isDuplicate: false });

    // 검색어 필터 (email.searchText에서 ILIKE 검색)
    if (options.search) {
      query.andWhere('email.searchText ILIKE :search', { search: `%${options.search}%` });
    }

    // 카테고리 필터
    if (options.category) {
      query.andWhere('report.category = :category', { category: options.category });
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
      .andWhere('report.isPayment = :isPayment', { isPayment: true })
      .andWhere('report.isDuplicate = :isDuplicate', { isDuplicate: false })
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
      .andWhere('report.isPayment = :isPayment', { isPayment: true })
      .andWhere('report.isDuplicate = :isDuplicate', { isDuplicate: false })
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
      .leftJoin('email.paymentReport', 'report')
      .where('report.id IS NULL') // PaymentReport가 없는 이메일만 (미분석)
      .orderBy('email.receivedAt', 'DESC');

    if (options?.limit) {
      query.take(options.limit);
    }

    return query.getMany();
  }

  /**
   * 모든 PaymentReport 삭제 (규칙 변경 시 재분석용)
   */
  async deleteAllReports(): Promise<number> {
    const result = await this.paymentReportRepo.delete({});
    console.log(`[Email Analysis] Deleted ${result.affected} reports`);
    return result.affected || 0;
  }

  /**
   * 특정 사용자의 PaymentReport 삭제
   */
  async deleteUserReports(userId: number): Promise<number> {
    const result = await this.paymentReportRepo
      .createQueryBuilder('report')
      .delete()
      .where('report.emailId IN (SELECT id FROM emails WHERE "userId" = :userId)', { userId })
      .execute();
    console.log(`[Email Analysis] Deleted ${result.affected} reports for user ${userId}`);
    return result.affected || 0;
  }

  /**
   * 이메일에서 파일 수집 (HTML 이미지 URL + 첨부파일: 이미지 + PDF)
   * 200x200 이하 이미지는 스킵
   */
  private async collectFiles(emailId: number, htmlBody: string | null): Promise<FileData[]> {
    const files: FileData[] = [];

    // 1. PDF 첨부파일 먼저 추가 (결제 정보가 PDF에 있을 확률이 높음)
    const pdfAttachments = await this.attachmentRepo.find({
      where: { 
        emailId,
        mimeType: 'application/pdf',
      },
      take: 5, // PDF는 최대 5개
    });

    for (const att of pdfAttachments) {
      // 너무 큰 PDF는 스킵 (10MB 이상)
      if (att.data && att.data.length > 10 * 1024 * 1024) {
        console.log(`[File Collect] Skipping large PDF: ${att.filename} (${this.formatSize(att.data.length)})`);
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
    console.log(`[File Collect] Found ${files.length} PDF attachments`);

    // 2. HTML body에서 이미지 URL 추출 → 다운로드해서 base64로 변환 (200x200 이상만)
    if (htmlBody) {
      const urlImages = this.extractImageUrlsFromHtml(htmlBody);
      console.log(`[File Collect] Processing ${urlImages.length} image URLs...`);
      
      for (const url of urlImages) {
        // 유효한 이미지 URL인지 확인 (http/https)
        if (url.startsWith('http://') || url.startsWith('https://')) {
          // URL 패턴으로 트래킹 픽셀 사전 필터링
          if (this.isLikelyContentImage(url)) {
            // URL 이미지를 다운로드해서 base64로 변환 (200x200 이상만)
            const downloaded = await this.downloadImageAsBase64(url);
            if (downloaded) {
              files.push(downloaded);
            }
          }
        }
      }
    }

    // 3. 첨부된 인라인 이미지 추가 (200x200 이상만)
    const imageAttachments = await this.attachmentRepo.find({
      where: { 
        emailId,
        isInline: true,
      },
    });

    for (const att of imageAttachments) {
      // 이미지 타입만 처리
      if (!att.mimeType?.startsWith('image/')) continue;

      // 너무 큰 이미지는 스킵 (5MB 이상)
      if (att.data && att.data.length > 5 * 1024 * 1024) {
        console.log(`[File Collect] Skipping large image: ${att.filename}`);
        continue;
      }

      if (att.data) {
        // 이미지 크기 확인 (200x200 이상만)
        try {
          const dimensions = imageSize(att.data);
          if (dimensions.width && dimensions.height) {
            if (dimensions.width < 200 || dimensions.height < 200) {
              console.log(`[File Collect] Skipping small inline image: ${att.filename} (${dimensions.width}x${dimensions.height})`);
              continue;
            }
            console.log(`[File Collect] Inline image: ${att.filename} (${dimensions.width}x${dimensions.height})`);
          }
        } catch {
          // 크기 확인 실패 시 포함
        }

        files.push({
          type: 'base64',
          data: att.data.toString('base64'),
          mimeType: att.mimeType,
          filename: att.filename,
        });
      }
    }

    console.log(`[File Collect] Total ${files.length} files collected for email ${emailId}`);
    return files;
  }

  /**
   * URL에서 이미지 다운로드 후 base64로 변환
   * 200x200 이하 또는 실패 시 null 반환
   */
  private async downloadImageAsBase64(url: string): Promise<FileData | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': new URL(url).origin,
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.log(`[Image Download] Failed (${response.status}): ${url.substring(0, 80)}...`);
        return null;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // 이미지가 아니면 스킵
      if (!contentType.startsWith('image/')) {
        console.log(`[Image Download] Not an image (${contentType}): ${url.substring(0, 80)}...`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 너무 작은 파일은 스킵 (1KB 미만)
      if (buffer.length < 1024) {
        console.log(`[Image Download] Skipping tiny file (${buffer.length} bytes)`);
        return null;
      }

      // 너무 큰 이미지는 스킵 (5MB 이상)
      if (buffer.length > 5 * 1024 * 1024) {
        console.log(`[Image Download] Skipping large image (${this.formatSize(buffer.length)})`);
        return null;
      }

      // 이미지 크기 확인 (200x200 이상만)
      try {
        const dimensions = imageSize(buffer);
        if (dimensions.width && dimensions.height) {
          if (dimensions.width < 200 || dimensions.height < 200) {
            console.log(`[Image Download] Skipping small image (${dimensions.width}x${dimensions.height}): ${url.substring(0, 60)}...`);
            return null;
          }
          console.log(`[Image Download] OK (${dimensions.width}x${dimensions.height}, ${this.formatSize(buffer.length)}): ${url.substring(0, 60)}...`);
        }
      } catch {
        // 크기 확인 실패해도 포함 (SVG 등)
        console.log(`[Image Download] OK (size unknown, ${this.formatSize(buffer.length)}): ${url.substring(0, 60)}...`);
      }
      
      return {
        type: 'base64',
        data: buffer.toString('base64'),
        mimeType: contentType,
      };
    } catch (error) {
      console.log(`[Image Download] Error: ${error.message} - ${url.substring(0, 60)}...`);
      return null;
    }
  }

  /**
   * HTML에서 img 태그의 src URL 추출
   */
  private extractImageUrlsFromHtml(html: string): string[] {
    const urls: string[] = [];
    
    // <img src="..."> 패턴 매칭 (src 속성값 전체 추출)
    const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
    let match;
    
    while ((match = imgRegex.exec(html)) !== null) {
      let url = match[1];
      // HTML 엔티티 디코딩 (&amp; → &, &#38; → & 등)
      url = this.decodeHtmlEntities(url);
      if (url && !urls.includes(url)) {
        urls.push(url);
        console.log(`[Image Extract] Found: ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
      }
    }

    // background-image: url(...) 패턴도 체크
    const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
    while ((match = bgRegex.exec(html)) !== null) {
      let url = match[1];
      url = this.decodeHtmlEntities(url);
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    }

    console.log(`[Image Extract] Total ${urls.length} image URLs found`);
    return urls;
  }

  /**
   * HTML 엔티티 디코딩 (URL용)
   */
  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#38;/g, '&')
      .replace(/&#x26;/gi, '&');
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

  // ==================== 중복 감지 ====================

  /**
   * 특정 사용자의 결제 리포트에서 중복 감지
   */
  async detectDuplicates(userId: number): Promise<{
    duplicatesFound: number;
    groups: { primary: PaymentReport; duplicates: PaymentReport[] }[];
  }> {
    // isPayment=true인 리포트만 가져오기
    const reports = await this.paymentReportRepo.find({
      where: { isPayment: true, isDuplicate: false },
      relations: ['email'],
      order: { paymentDate: 'ASC', createdAt: 'ASC' },
    });

    // 해당 userId의 리포트만 필터링
    const userReports = reports.filter(r => r.email?.userId === userId);
    
    console.log(`[Duplicate Detection] Checking ${userReports.length} reports for user ${userId}`);

    const groups: { primary: PaymentReport; duplicates: PaymentReport[] }[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < userReports.length; i++) {
      const report = userReports[i];
      if (processed.has(report.id)) continue;

      const duplicates: PaymentReport[] = [];

      for (let j = i + 1; j < userReports.length; j++) {
        const other = userReports[j];
        if (processed.has(other.id)) continue;

        if (this.isPotentialDuplicate(report, other)) {
          duplicates.push(other);
          processed.add(other.id);
        }
      }

      if (duplicates.length > 0) {
        // 더 상세한 정보가 있는 리포트를 primary로 선택
        const allInGroup = [report, ...duplicates];
        const primary = this.selectPrimaryReport(allInGroup);
        const others = allInGroup.filter(r => r.id !== primary.id);

        groups.push({ primary, duplicates: others });
        processed.add(report.id);
      }
    }

    console.log(`[Duplicate Detection] Found ${groups.length} duplicate groups`);
    return {
      duplicatesFound: groups.reduce((sum, g) => sum + g.duplicates.length, 0),
      groups,
    };
  }

  /**
   * 중복 감지 결과를 DB에 저장 (isDuplicate, primaryReportId 설정)
   */
  async markDuplicates(userId: number): Promise<{
    marked: number;
    groups: { primaryId: number; duplicateIds: number[] }[];
  }> {
    const { groups } = await this.detectDuplicates(userId);

    const result: { primaryId: number; duplicateIds: number[] }[] = [];
    let marked = 0;

    for (const group of groups) {
      const duplicateIds: number[] = [];

      for (const dup of group.duplicates) {
        await this.paymentReportRepo.update(dup.id, {
          isDuplicate: true,
          primaryReportId: group.primary.id,
        });
        duplicateIds.push(dup.id);
        marked++;
      }

      result.push({
        primaryId: group.primary.id,
        duplicateIds,
      });
    }

    console.log(`[Duplicate Detection] Marked ${marked} duplicates`);
    return { marked, groups: result };
  }

  /**
   * 중복 플래그 초기화 (재감지 전 사용)
   */
  async resetDuplicates(userId: number): Promise<number> {
    const reports = await this.paymentReportRepo.find({
      where: { isDuplicate: true },
      relations: ['email'],
    });

    const userReports = reports.filter(r => r.email?.userId === userId);
    
    for (const report of userReports) {
      await this.paymentReportRepo.update(report.id, {
        isDuplicate: false,
        primaryReportId: undefined,
      });
    }

    console.log(`[Duplicate Detection] Reset ${userReports.length} duplicates for user ${userId}`);
    return userReports.length;
  }

  /**
   * 두 리포트가 중복인지 판단
   */
  private isPotentialDuplicate(a: PaymentReport, b: PaymentReport): boolean {
    // 1. 날짜 비교 (같은 날 ±1일)
    if (!this.isSameDay(a.paymentDate, b.paymentDate, 1)) {
      return false;
    }

    // 2. 금액 비교 (둘 다 있으면 같아야 함)
    if (a.amount && b.amount && Math.abs(a.amount - b.amount) > 0.01) {
      return false;
    }

    // 3. 가맹점 비교 (유사도)
    if (!this.isSimilarMerchant(a.merchant, b.merchant)) {
      return false;
    }

    console.log(`[Duplicate] Potential match: "${a.merchant}" (${a.amount}) <-> "${b.merchant}" (${b.amount})`);
    return true;
  }

  /**
   * 날짜가 같은지 비교 (±허용일 포함)
   */
  private isSameDay(date1: Date | null, date2: Date | null, toleranceDays = 0): boolean {
    if (!date1 || !date2) return true; // 날짜 없으면 통과
    
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    // 시간 제거
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);

    const diffDays = Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= toleranceDays;
  }

  /**
   * 가맹점 이름이 유사한지 판단
   */
  private isSimilarMerchant(a: string | null, b: string | null): boolean {
    if (!a || !b) return true; // 하나라도 없으면 통과

    const normA = this.normalizeMerchant(a);
    const normB = this.normalizeMerchant(b);

    // 정규화 후 같으면 중복
    if (normA === normB) return true;

    // 한쪽이 다른쪽을 포함하면 중복
    if (normA.includes(normB) || normB.includes(normA)) return true;

    // 공통 단어가 있으면 중복 (첫 번째 단어 기준)
    const wordsA = normA.split(/\s+/);
    const wordsB = normB.split(/\s+/);
    
    if (wordsA[0] && wordsB[0] && wordsA[0].length >= 3) {
      if (wordsA[0] === wordsB[0]) return true;
    }

    return false;
  }

  /**
   * 가맹점 이름 정규화
   */
  private normalizeMerchant(merchant: string): string {
    return merchant
      .toLowerCase()
      .replace(/[,.()\[\]{}'"]/g, '') // 특수문자 제거
      .replace(/\s+(inc|llc|ltd|co|corp|corporation)\.?$/i, '') // 회사 접미사 제거
      .replace(/\s*\(.*?\)\s*/g, ' ') // 괄호 안 내용 제거 (NaverPay 등)
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 그룹 중 가장 상세한 정보를 가진 리포트 선택
   */
  private selectPrimaryReport(reports: PaymentReport[]): PaymentReport {
    return reports.reduce((best, current) => {
      const bestScore = this.getDetailScore(best);
      const currentScore = this.getDetailScore(current);
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * 리포트의 상세 정보 점수 계산
   */
  private getDetailScore(report: PaymentReport): number {
    let score = 0;
    if (report.amount) score += 10;
    if (report.merchant) score += 5;
    if (report.paymentDate) score += 5;
    if (report.cardType) score += 3;
    if (report.currency) score += 2;
    if (report.paymentType) score += 2;
    if (report.category) score += 2;
    if (report.summary?.length > 20) score += 1;
    return score;
  }
}

