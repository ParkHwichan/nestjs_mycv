import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoogleService } from './google.service';

@Injectable()
export class GoogleScheduler {
  private isSyncing = false;  // 중복 실행 방지 락
  private lastSyncAt: Date | null = null;

  constructor(private googleService: GoogleService) {
    console.log('[GoogleScheduler] Initialized');
  }

  /**
   * 30초마다 모든 사용자 메일 동기화
   * - 이전 작업이 진행 중이면 스킵
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleEmailSync() {
    // 이미 동기화 중이면 스킵
    if (this.isSyncing) {
      console.log('[Gmail Sync] Already syncing, skipping this cycle');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();
    console.log('\n[Gmail Sync] Started at', new Date().toISOString());
    
    try {
      await this.googleService.syncAllUsers();
      this.lastSyncAt = new Date();
    } catch (err) {
      console.error('[Gmail Sync] Failed:', err.message);
    } finally {
      this.isSyncing = false;
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Gmail Sync] Completed in ${duration}s\n`);
    }
  }

  /**
   * 수동 동기화 트리거
   */
  async triggerSync(userId?: number): Promise<any> {
    if (this.isSyncing) {
      return { success: false, message: 'Sync already in progress' };
    }

    if (userId) {
      return this.googleService.syncUserEmails(userId, { maxResults: 100 });
    }
    
    // 전체 동기화
    this.isSyncing = true;
    try {
      await this.googleService.syncAllUsers();
      this.lastSyncAt = new Date();
      return { success: true, message: 'Sync completed for all users' };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 동기화 상태 조회
   */
  getStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncAt: this.lastSyncAt?.toISOString() || null,
    };
  }
}
