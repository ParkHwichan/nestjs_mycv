import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoogleService } from './google.service';

@Injectable()
export class GoogleScheduler {
  constructor(private googleService: GoogleService) {
    console.log('[GoogleScheduler] Initialized');
  }

  /**
   * 10초마다 모든 사용자 메일 동기화
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleEmailSync() {
    console.log('\n[Cron] Email sync started at', new Date().toISOString());
    
    try {
      await this.googleService.syncAllUsers();
    } catch (err) {
      console.error('[Cron] Email sync failed:', err.message);
    }

    console.log('[Cron] Email sync completed\n');
  }

  /**
   * 수동 동기화 트리거 (테스트/디버그용)
   */
  async triggerSync(userId?: number): Promise<any> {
    if (userId) {
      return this.googleService.syncUserEmails(userId, { maxResults: 100 });
    }
    await this.googleService.syncAllUsers();
    return { message: 'Sync completed for all users' };
  }
}
