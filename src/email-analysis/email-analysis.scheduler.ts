import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailAnalysisService } from './email-analysis.service';

interface QueueItem {
  emailId: number;
  userId: number;
  addedAt: Date;
}

@Injectable()
export class EmailAnalysisScheduler {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private isEnqueuing = false;

  constructor(private emailAnalysisService: EmailAnalysisService) {
    console.log('[EmailAnalysisScheduler] Initialized with queue system');
  }

  /**
   * 큐 상태 조회
   */
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      isEnqueuing: this.isEnqueuing,
      nextItems: this.queue.slice(0, 5).map(q => ({ emailId: q.emailId, userId: q.userId })),
    };
  }

  /**
   * [Producer] 5분마다 미분석 이메일을 큐에 추가
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async enqueueUnanalyzedEmails() {
    if (this.isEnqueuing) {
      console.log('[Queue Producer] Already enqueuing, skipping...');
      return;
    }

    this.isEnqueuing = true;
    console.log('\n[Queue Producer] Checking for unanalyzed emails...');

    try {
      const emailsToEnqueue = await this.emailAnalysisService.getUnanalyzedEmails({ limit: 50 });
      
      // 이미 큐에 있는 이메일 제외
      const existingIds = new Set(this.queue.map(q => q.emailId));
      const newEmails = emailsToEnqueue.filter(e => !existingIds.has(e.id));

      for (const email of newEmails) {
        this.queue.push({
          emailId: email.id,
          userId: email.userId,
          addedAt: new Date(),
        });
      }

      if (newEmails.length > 0) {
        console.log(`[Queue Producer] Added ${newEmails.length} emails to queue. Total: ${this.queue.length}`);
      } else {
        console.log('[Queue Producer] No new emails to enqueue');
      }
    } catch (err) {
      console.error('[Queue Producer] Failed:', err.message);
    } finally {
      this.isEnqueuing = false;
    }
  }

  /**
   * [Consumer] 30초마다 큐에서 이메일 처리
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processQueue() {
    if (this.isProcessing) {
      console.log('[Queue Consumer] Already processing, skipping...');
      return;
    }

    if (this.queue.length === 0) {
      return; // 큐가 비어있으면 조용히 스킵
    }

    this.isProcessing = true;
    const batchSize = 5; // 한 번에 처리할 개수
    const batch = this.queue.splice(0, batchSize);

    console.log(`\n[Queue Consumer] Processing ${batch.length} emails. Remaining: ${this.queue.length}`);

    let processed = 0;
    let payments = 0;
    let failed = 0;

    for (const item of batch) {
      try {
        const result = await this.emailAnalysisService.analyzeEmail(item.emailId);
        processed++;
        if (result.paymentReport) {
          payments++;
        }
      } catch (err) {
        console.error(`[Queue Consumer] Failed for email ${item.emailId}:`, err.message);
        failed++;
        // 실패한 항목은 다시 큐에 넣지 않음 (무한 루프 방지)
      }
    }

    console.log(`[Queue Consumer] Done - Processed: ${processed}, Payments: ${payments}, Failed: ${failed}`);
    this.isProcessing = false;
  }

  /**
   * 수동으로 큐에 추가
   */
  async manualEnqueue(emailIds: number[]): Promise<number> {
    const existingIds = new Set(this.queue.map(q => q.emailId));
    let added = 0;

    for (const emailId of emailIds) {
      if (!existingIds.has(emailId)) {
        // userId는 나중에 처리할 때 확인하므로 0으로 설정
        this.queue.push({ emailId, userId: 0, addedAt: new Date() });
        added++;
      }
    }

    return added;
  }

  /**
   * 큐 비우기
   */
  clearQueue(): number {
    const cleared = this.queue.length;
    this.queue = [];
    return cleared;
  }

  /**
   * 수동 트리거 - 즉시 큐 처리
   */
  async triggerProcess(): Promise<any> {
    if (this.queue.length === 0) {
      return { message: 'Queue is empty' };
    }
    await this.processQueue();
    return { message: 'Processing triggered', remaining: this.queue.length };
  }

  /**
   * 수동 트리거 - 즉시 큐에 추가
   */
  async triggerEnqueue(): Promise<any> {
    await this.enqueueUnanalyzedEmails();
    return { message: 'Enqueue triggered', queueLength: this.queue.length };
  }
}
