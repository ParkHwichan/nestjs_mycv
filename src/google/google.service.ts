import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { Email } from './entities/email.entity';
import { EmailAttachment } from './entities/email-attachment.entity';

@Injectable()
export class GoogleService {
  constructor(
    private authService: AuthService,
    @InjectRepository(Email)
    private emailRepo: Repository<Email>,
    @InjectRepository(EmailAttachment)
    private attachmentRepo: Repository<EmailAttachment>,
  ) {
    console.log('[GoogleService] Initialized (Gmail Sync)');
  }

  /**
   * 유효한 Access Token 가져오기
   */
  private async getValidAccessToken(userId: number): Promise<string> {
    return this.authService.getValidAccessToken(userId);
  }

  /**
   * 사용자의 새 메일 동기화 (DB에 없는 메일만)
   */
  async syncUserEmails(userId: number, options?: {
    maxResults?: number;
    q?: string;
  }): Promise<{ synced: number; skipped: number }> {
    console.log(`[Gmail Sync] Starting for user ${userId}...`);
    
    const accessToken = await this.getValidAccessToken(userId);
    
    // 1. Gmail에서 메일 목록 가져오기
    const messageList = await this.fetchGmailMessageList(accessToken, options);
    
    if (!messageList.messages || messageList.messages.length === 0) {
      console.log('[Gmail Sync] No messages found');
      return { synced: 0, skipped: 0 };
    }

    console.log(`[Gmail Sync] Found ${messageList.messages.length} messages`);

    // 2. DB에 이미 있는 메일 ID 조회
    const existingIds = await this.getExistingMessageIds(userId, 
      messageList.messages.map((m: any) => m.id)
    );
    
    // 3. 새 메일만 필터링
    const newMessages = messageList.messages.filter(
      (m: any) => !existingIds.has(m.id)
    );

    console.log(`[Gmail Sync] New messages: ${newMessages.length}, Skipped: ${messageList.messages.length - newMessages.length}`);

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
      skipped: messageList.messages.length - newMessages.length 
    };
  }

  /**
   * Gmail 메일 목록 조회
   */
  private async fetchGmailMessageList(accessToken: string, options?: {
    maxResults?: number;
    q?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    params.append('maxResults', (options?.maxResults || 50).toString());
    if (options?.q) params.append('q', options.q);

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

    // 3. Email 엔티티 생성
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
      snippet: gmailMessage.snippet,
      labelIds: gmailMessage.labelIds,
      receivedAt: new Date(parseInt(gmailMessage.internalDate)),
      isRead: !gmailMessage.labelIds?.includes('UNREAD'),
      hasAttachments: parsed.attachments.length > 0,
      hasImages: parsed.inlineImages.length > 0,
    });

    // 4. DB에 저장
    await this.emailRepo.save(email);
    console.log(`[Gmail Sync] Saved email: ${email.subject?.substring(0, 30)}...`);

    // 5. 첨부파일 및 이미지 저장
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
        
        // 본문 추출
        if (part.mimeType === 'text/plain' && part.body?.data && !textBody) {
          textBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        
        if (part.parts) {
          extractParts(part.parts);
        }
      }
    };

    if (message.payload?.body?.data) {
      const mimeType = message.payload.mimeType;
      if (mimeType === 'text/html') {
        htmlBody = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      } else {
        textBody = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      }
    }
    
    if (message.payload?.parts) {
      extractParts(message.payload.parts);
    }

    return {
      from: getHeader('From'),
      to: getHeader('To'),
      cc: getHeader('Cc'),
      subject: getHeader('Subject'),
      body: textBody,
      htmlBody: htmlBody,
      attachments,
      inlineImages,
    };
  }

  /**
   * 모든 사용자 메일 동기화 (크론용)
   */
  async syncAllUsers(): Promise<void> {
    console.log('[Gmail Sync] Starting sync for all users...');
    
    // Google 토큰이 있는 모든 사용자 조회
    const users = await this.authService.getAllUsersWithGoogleToken();
    
    for (const user of users) {
      try {
        await this.syncUserEmails(user.id, { maxResults: 100 });
      } catch (err) {
        console.error(`[Gmail Sync] Failed for user ${user.id}:`, err.message);
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
}
