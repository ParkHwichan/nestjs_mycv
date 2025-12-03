import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class AuthScheduler {
  constructor(private authService: AuthService) {
    console.log('[AuthScheduler] Initialized');
  }

  /**
   * 매일 새벽 3시에 모든 사용자 토큰 갱신
   * - 6개월 미사용 만료 방지
   * - 실패 시 needsReauth 플래그 설정
   */
  @Cron('0 3 * * *') // 매일 03:00
  async handleTokenRefresh() {
    console.log('[Cron] Starting daily token refresh...');
    
    try {
      const result = await this.authService.refreshAllTokens();
      console.log(`[Cron] Token refresh completed - Success: ${result.success}, Failed: ${result.failed}`);
    } catch (err) {
      console.error('[Cron] Token refresh error:', err.message);
    }
  }

  /**
   * 수동 트리거 (API에서 호출 가능)
   */
  async triggerTokenRefresh(): Promise<{ success: number; failed: number }> {
    console.log('[AuthScheduler] Manual token refresh triggered');
    return this.authService.refreshAllTokens();
  }
}

