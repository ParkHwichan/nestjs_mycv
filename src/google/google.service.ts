import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { Email } from './entities/email.entity';
import { EmailAttachment } from './entities/email-attachment.entity';
import { MailAccount } from '../mail/entities/mail-account.entity';

@Injectable()
export class GoogleService {
  constructor(
    private authService: AuthService,
    @InjectRepository(Email)
    private emailRepo: Repository<Email>,
    @InjectRepository(EmailAttachment)
    private attachmentRepo: Repository<EmailAttachment>,
    @InjectRepository(MailAccount)
    private mailAccountRepo: Repository<MailAccount>,
  ) {
    console.log('[GoogleService] Initialized (Gmail Sync)');
  }

  /**
   * 유효한 Access Token 가져오기
   */
  private async getValidAccessToken(userId: number): Promise<string> {
    return this.authService.getValidMailAccessToken('google', userId);
  }

  /**
   * 사용자의 새 메일 동기화 (DB에 없는 메일만)
   */
  async syncUserEmails(userId: number, options?: {
    maxResults?: number;
    q?: string;
  }): Promise<{ synced: number; skipped: number }> {
    console.log(`[Gmail Sync] Starting for user ${userId}...`);
    
    let isFirstSync = false;
    const accessToken = await this.getValidAccessToken(userId);
    
    // DB에서 가장 최근 이메일 날짜 조회 → after 쿼리 생성
    const lastEmail = await this.emailRepo.findOne({
      where: { userId },
      order: { receivedAt: 'DESC' },
      select: ['receivedAt'],
    }); 

    let query = options?.q || '';
    if (lastEmail?.receivedAt) {
      // Unix timestamp (초 단위) + 2초 (Gmail after: 경계 포함 문제 해결)
      const afterTimestamp = Math.floor(lastEmail.receivedAt.getTime() / 1000) + 2;
      query = query ? `${query} after:${afterTimestamp}` : `after:${afterTimestamp}`;
      console.log(`[Gmail Sync] Using after filter: ${new Date(afterTimestamp * 1000).toISOString()}`);
    } else {
      // 최초 동기화: 최근 3개월로 제한
      isFirstSync = true;
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const afterTimestamp = Math.floor(threeMonthsAgo.getTime() / 1000);
      query = query ? `${query} after:${afterTimestamp}` : `after:${afterTimestamp}`;
      console.log(`[Gmail Sync] First sync - limiting to last 3 months: ${threeMonthsAgo.toISOString()}`);
    }
    
    // 1. Gmail에서 메일 목록 가져오기 (최초 동기화 시 전체 페이지 순회)
    const requestedPageSize = options?.maxResults ?? (isFirstSync ? 500 : 50);
    const pageSize = Math.min(requestedPageSize, 500);
    const allMessages: any[] = [];
    let pageToken: string | undefined;

    do {
      const messageList = await this.fetchGmailMessageList(accessToken, {
        maxResults: pageSize,
        q: query || undefined,
        pageToken,
      });

      if (!messageList.messages || messageList.messages.length === 0) {
        if (allMessages.length === 0) {
          console.log('[Gmail Sync] No messages found');
        }
        break;
      }

      allMessages.push(...messageList.messages);

      if (isFirstSync && messageList.nextPageToken) {
        pageToken = messageList.nextPageToken;
        console.log(`[Gmail Sync] First sync pagination - collected ${allMessages.length} messages so far`);
      } else {
        pageToken = undefined;
      }
    } while (isFirstSync && pageToken);

    if (allMessages.length === 0) {
      return { synced: 0, skipped: 0 };
    }

    console.log(`[Gmail Sync] Found ${allMessages.length} messages`);

    // 2. DB에 이미 있는 메일 ID 조회
    const existingIds = await this.getExistingMessageIds(
      userId,
      allMessages.map((m: any) => m.id),
    );
    
    // 3. 새 메일만 필터링
    const newMessages = allMessages.filter(
      (m: any) => !existingIds.has(m.id)
    );

    console.log(`[Gmail Sync] New messages: ${newMessages.length}, Skipped: ${allMessages.length - newMessages.length}`);

    // 4. 새 메일 상세 조회 및 저장
    let syncedCount = 0;
    for (const msg of newMessages) {
      try {
        await this.fetchAndSaveEmail(userId, accessToken, msg.id);
        syncedCount++;
      } catch (err) {
        console.error(`[Gmail Sync] Failed to sync message ${msg.id}:`, err.message);
      }
    }

    console.log(`[Gmail Sync] Completed. Synced: ${syncedCount}`);
    return {
      synced: syncedCount,
      skipped: allMessages.length - newMessages.length,
    };
  }

  /**
   * Gmail 메일 목록 조회
   */
  private async fetchGmailMessageList(accessToken: string, options?: {
    maxResults?: number;
    q?: string;
    pageToken?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    params.append('maxResults', (options?.maxResults || 50).toString());
    if (options?.q) params.append('q', options.q);
    if (options?.pageToken) params.append('pageToken', options.pageToken);

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get messages');
    }

    return response.json();
  }

  /**
   * DB에 이미 존재하는 메일 ID 조회
   */
  private async getExistingMessageIds(userId: number, messageIds: string[]): Promise<Set<string>> {
    const existing = await this.emailRepo.find({
      where: messageIds.map(id => ({ userId, messageId: id })),
      select: ['messageId'],
    });
    return new Set(existing.map(e => e.messageId));
  }

  /**
   * 단일 메일 상세 조회 및 DB 저장
   */
  private async fetchAndSaveEmail(userId: number, accessToken: string, messageId: string): Promise<Email> {
    // 1. Gmail API로 메일 상세 조회
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get message');
    }

    const gmailMessage = await response.json();
    
    // 2. 메일 파싱
    const parsed = this.parseGmailMessage(gmailMessage);

    // 3. 검색용 텍스트 생성
    const searchText = this.buildSearchText(
      parsed.subject,
      parsed.from,
      parsed.body,
      parsed.htmlBody,
    );

    // 4. Email 엔티티 생성
    const email = this.emailRepo.create({
      userId,
      messageId: gmailMessage.id,
      threadId: gmailMessage.threadId,
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc,
      subject: parsed.subject,
      body: parsed.body,
      htmlBody: parsed.htmlBody,
      searchText,
      snippet: gmailMessage.snippet,
      labelIds: gmailMessage.labelIds,
      receivedAt: new Date(parseInt(gmailMessage.internalDate)),
      isRead: !gmailMessage.labelIds?.includes('UNREAD'),
      hasAttachments: parsed.attachments.length > 0,
      hasImages: parsed.inlineImages.length > 0,
    });

    // 5. DB에 저장
    await this.emailRepo.save(email);
    console.log(`[Gmail Sync] Saved email: ${email.subject?.substring(0, 30)}...`);

    // 6. 첨부파일 및 이미지 저장
    const allAttachments = [...parsed.attachments, ...parsed.inlineImages];
    for (const att of allAttachments) {
      try {
        await this.fetchAndSaveAttachment(userId, accessToken, email.id, messageId, att);
      } catch (err) {
        console.error(`[Gmail Sync] Failed to save attachment ${att.filename}:`, err.message);
      }
    }

    return email;
  }

  /**
   * 첨부파일/이미지 다운로드 및 DB 저장
   */
  private async fetchAndSaveAttachment(
    userId: number,
    accessToken: string,
    emailId: number,
    messageId: string,
    attachmentInfo: any
  ): Promise<void> {
    // Gmail API로 첨부파일 데이터 가져오기
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentInfo.id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch attachment');
    }

    const result = await response.json();
    
    // base64url → Buffer
    const base64 = result.data.replace(/-/g, '+').replace(/_/g, '/');
    const data = Buffer.from(base64, 'base64');

    // DB에 저장
    const attachment = this.attachmentRepo.create({
      emailId,
      attachmentId: attachmentInfo.id,
      filename: attachmentInfo.filename || 'unknown',
      mimeType: attachmentInfo.mimeType,
      size: attachmentInfo.size || data.length,
      contentId: attachmentInfo.contentId,
      isInline: attachmentInfo.isInline || false,
      data,
    });

    await this.attachmentRepo.save(attachment);
    console.log(`[Gmail Sync] Saved attachment: ${attachment.filename} (${this.formatSize(data.length)})`);
  }

  /**
   * Gmail API의 URL-safe Base64 디코딩
   */
  private decodeBase64Url(data: string): string {
    // URL-safe Base64 → 일반 Base64 변환
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  }

  /**
   * Gmail 메시지 파싱
   */
  private parseGmailMessage(message: any): any {
    const headers = message.payload?.headers || [];
    
    const getHeader = (name: string) => 
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;

    let textBody = '';
    let htmlBody = '';
    const attachments: any[] = [];
    const inlineImages: any[] = [];
    
    const extractParts = (parts: any[]) => {
      for (const part of parts) {
        const partHeaders = part.headers || [];
        const contentId = partHeaders.find((h: any) => 
          h.name.toLowerCase() === 'content-id')?.value?.replace(/[<>]/g, '');
        const contentDisposition = partHeaders.find((h: any) => 
          h.name.toLowerCase() === 'content-disposition')?.value || '';

        // 인라인 이미지
        if (part.mimeType?.startsWith('image/') && part.body?.attachmentId) {
          const imageInfo = {
            id: part.body.attachmentId,
            filename: part.filename || 'image',
            mimeType: part.mimeType,
            size: part.body.size,
            contentId: contentId,
            isInline: contentDisposition.includes('inline') || !!contentId,
          };
          
          if (imageInfo.isInline) {
            inlineImages.push(imageInfo);
          } else {
            attachments.push(imageInfo);
          }
        }
        // 일반 첨부파일
        else if (part.filename && part.body?.attachmentId) {
          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            isInline: false,
          });
        }
        
        // 본문 추출 (URL-safe Base64 디코딩)
        if (part.mimeType === 'text/plain' && part.body?.data && !textBody) {
          textBody = this.decodeBase64Url(part.body.data);
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          htmlBody = this.decodeBase64Url(part.body.data);
        }
        
        if (part.parts) {
          extractParts(part.parts);
        }
      }
    };

    if (message.payload?.body?.data) {
      const mimeType = message.payload.mimeType;
      if (mimeType === 'text/html') {
        htmlBody = this.decodeBase64Url(message.payload.body.data);
      } else {
        textBody = this.decodeBase64Url(message.payload.body.data);
      }
    }
    
    if (message.payload?.parts) {
      extractParts(message.payload.parts);
    }

    // 포워딩 메일인 경우 원래 발신자 추출
    let from = getHeader('From');
    const subject = getHeader('Subject');
    
    if (this.isForwardedEmail(subject)) {
      const originalFrom = this.extractOriginalSender(textBody || htmlBody);
      if (originalFrom) {
        from = originalFrom;
      }
    }

    return {
      from,
      to: getHeader('To'),
      cc: getHeader('Cc'),
      subject,
      body: textBody,
      htmlBody: htmlBody,
      attachments,
      inlineImages,
    };
  }

  /**
   * 포워딩된 이메일인지 확인
   */
  private isForwardedEmail(subject: string | undefined): boolean {
    if (!subject) return false;
    const lowerSubject = subject.toLowerCase();
    return lowerSubject.startsWith('fwd:') || 
           lowerSubject.startsWith('fw:') ||
           lowerSubject.startsWith('전달:') ||
           lowerSubject.includes('forwarded');
  }

  /**
   * 포워딩된 이메일에서 원래 발신자 추출
   */
  private extractOriginalSender(body: string | undefined): string | null {
    if (!body) return null;

    // 패턴 1: "From: Name <email@example.com>" 형식
    // 패턴 2: "From: email@example.com" 형식
    // 패턴 3: "보낸 사람: ..." 형식 (한글)
    const patterns = [
      /From:\s*(.+?<[^>]+>)/i,                    // From: Name <email>
      /From:\s*([^\n<]+@[^\n\s>]+)/i,            // From: email@domain
      /보낸\s*사람:\s*(.+?<[^>]+>)/i,             // 한글: 보낸 사람: Name <email>
      /보낸\s*사람:\s*([^\n<]+@[^\n\s>]+)/i,      // 한글: 보낸 사람: email@domain
      /발신자:\s*(.+?<[^>]+>)/i,                  // 한글: 발신자: Name <email>
    ];

    // "Forwarded message" 또는 "전달된 메시지" 이후의 From만 찾기
    const forwardMarkers = [
      '---------- Forwarded message ---------',
      '---------- 전달된 메시지 ----------',
      '-------- Original Message --------',
      '원본 메시지',
    ];

    let searchBody = body;
    for (const marker of forwardMarkers) {
      const idx = body.indexOf(marker);
      if (idx !== -1) {
        searchBody = body.substring(idx);
        break;
      }
    }

    for (const pattern of patterns) {
      const match = searchBody.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * 모든 사용자 메일 동기화 (크론용)
   */
  async syncAllUsers(): Promise<void> {
    console.log('[Gmail Sync] Starting sync for all users...');
    
    // 활성화된 Gmail 메일 계정 기준 사용자 조회
    const gmailAccounts = await this.mailAccountRepo.find({
      where: { provider: 'gmail', isActive: true, needsReauth: false },
      select: ['userId'],
    });

    const uniqueUserIds = [...new Set(gmailAccounts.map(acc => acc.userId))];
    console.log(`[Gmail Sync] Found ${uniqueUserIds.length} Gmail users (${gmailAccounts.length} active accounts)`);

    if (uniqueUserIds.length === 0) {
      console.log('[Gmail Sync] No Gmail accounts available for syncing');
      return;
    }

    for (const userId of uniqueUserIds) {
      try {
        await this.syncUserEmails(userId, { maxResults: 100 });
      } catch (err) {
        console.error(`[Gmail Sync] Failed for user ${userId}:`, err.message);
      }
    }

    console.log('[Gmail Sync] All users sync completed');
  }

  /**
   * 사용자의 저장된 이메일 조회
   */
  async getUserEmails(userId: number, options?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<Email[]> {
    const query = this.emailRepo.createQueryBuilder('email')
      .where('email.userId = :userId', { userId })
      .orderBy('email.receivedAt', 'DESC');

    if (options?.unreadOnly) {
      query.andWhere('email.isRead = false');
    }

    if (options?.limit) {
      query.take(options.limit);
    }

    if (options?.offset) {
      query.skip(options.offset);
    }

    return query.getMany();
  }

  /**
   * 이메일 상세 조회 (첨부파일 포함)
   */
  async getEmailWithAttachments(emailId: number): Promise<Email | null> {
    return this.emailRepo.findOne({
      where: { id: emailId },
      relations: ['attachments'],
    });
  }

  /**
   * 첨부파일 데이터 조회
   */
  async getAttachment(attachmentId: number): Promise<EmailAttachment | null> {
    return this.attachmentRepo.findOne({
      where: { id: attachmentId },
    });
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * 검색용 텍스트 생성 (subject + from + body + htmlBody 정제)
   */
  private buildSearchText(
    subject: string | undefined,
    from: string | undefined,
    body: string | undefined,
    htmlBody: string | undefined,
  ): string {
    const parts: string[] = [];

    if (subject) parts.push(subject);
    if (from) parts.push(from);
    if (body) parts.push(body);
    if (htmlBody) parts.push(this.extractTextFromHtml(htmlBody));

    // 중복 문장 제거
    const allText = parts.join(' ');
    const sentences = allText
      .split(/[.!?\n]+/)
      .map(s => s.trim().toLowerCase().replace(/\s+/g, ' '))
      .filter(s => s.length > 10);

    const uniqueSentences = [...new Set(sentences)];
    return uniqueSentences.join(' ');
  }

  /**
   * HTML에서 텍스트만 추출
   */
  private extractTextFromHtml(html: string): string {
    return html
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim();
  }
}
