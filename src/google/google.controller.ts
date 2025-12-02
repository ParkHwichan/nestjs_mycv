import { Controller, Get, Post, Param, Query, Res, Session } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { GoogleService } from './google.service';
import { GoogleScheduler } from './google.scheduler';

@ApiTags('google')
@Controller('google')
export class GoogleController {
  constructor(
    private googleService: GoogleService,
    private googleScheduler: GoogleScheduler,
  ) {}

  @Post('sync')
  @ApiOperation({ summary: 'Gmail 동기화', description: '로그인한 사용자의 Gmail을 DB에 동기화' })
  @ApiResponse({ status: 200, description: '동기화 성공' })
  async triggerSync(@Session() session: any) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const result = await this.googleService.syncUserEmails(session.userId, { 
        maxResults: 100 
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('emails')
  @ApiOperation({ summary: '이메일 목록 조회', description: '저장된 이메일 목록을 조회' })
  @ApiQuery({ name: 'limit', required: false, description: '조회 개수', example: 20 })
  @ApiQuery({ name: 'offset', required: false, description: '오프셋', example: 0 })
  @ApiQuery({ name: 'unreadOnly', required: false, description: '읽지 않은 메일만', example: 'false' })
  async getEmails(
    @Session() session: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const emails = await this.googleService.getUserEmails(session.userId, {
        limit: limit ? parseInt(limit) : 20,
        offset: offset ? parseInt(offset) : 0,
        unreadOnly: unreadOnly === 'true',
      });

      return { 
        success: true, 
        count: emails.length,
        data: emails.map(e => ({
          id: e.id,
          messageId: e.messageId,
          from: e.from,
          to: e.to,
          subject: e.subject,
          snippet: e.snippet,
          receivedAt: e.receivedAt,
          isRead: e.isRead,
          hasAttachments: e.hasAttachments,
          hasImages: e.hasImages,
          labelIds: e.labelIds,
        })),
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('emails/:id')
  @ApiOperation({ summary: '이메일 상세 조회', description: '첨부파일 정보를 포함한 이메일 상세 정보' })
  @ApiParam({ name: 'id', description: '이메일 ID', example: 1 })
  async getEmail(
    @Session() session: any,
    @Param('id') emailId: string,
  ) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const email = await this.googleService.getEmailWithAttachments(parseInt(emailId));
      
      if (!email || email.userId !== session.userId) {
        return { success: false, message: 'Email not found' };
      }

      return { 
        success: true, 
        data: {
          ...email,
          attachments: email.attachments?.map(a => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            isInline: a.isInline,
          })),
        },
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('attachments/:id')
  @ApiOperation({ summary: '첨부파일 다운로드', description: '이메일 첨부파일 다운로드 또는 인라인 표시' })
  @ApiParam({ name: 'id', description: '첨부파일 ID', example: 1 })
  @ApiQuery({ name: 'inline', required: false, description: '인라인으로 표시', example: 'true' })
  async getAttachment(
    @Session() session: any,
    @Param('id') attachmentId: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    if (!session.userId) {
      return res.status(401).json({ success: false, message: 'Not logged in' });
    }

    try {
      const attachment = await this.googleService.getAttachment(parseInt(attachmentId));
      
      if (!attachment) {
        return res.status(404).json({ success: false, message: 'Attachment not found' });
      }

      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');

      if (inline === 'true' || attachment.mimeType?.startsWith('image/')) {
        res.setHeader('Content-Disposition', 'inline');
      } else {
        const safeFilename = encodeURIComponent(attachment.filename);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);
      }

      res.send(attachment.data);
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
