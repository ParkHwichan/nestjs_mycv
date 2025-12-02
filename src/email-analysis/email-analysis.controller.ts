import { Controller, Get, Post, Delete, Param, Query, Session } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiResponse } from '@nestjs/swagger';
import { EmailAnalysisService } from './email-analysis.service';
import { EmailAnalysisScheduler } from './email-analysis.scheduler';

@ApiTags('email-analysis')
@Controller('email-analysis')
export class EmailAnalysisController {
  constructor(
    private emailAnalysisService: EmailAnalysisService,
    private emailAnalysisScheduler: EmailAnalysisScheduler,
  ) {}

  @Post('emails/:id/analyze')
  @ApiOperation({ summary: '단일 이메일 분석', description: 'GPT를 사용해 이메일을 분석하고 결제 정보가 있으면 PaymentReport 생성' })
  @ApiParam({ name: 'id', description: '이메일 ID', example: 1 })
  @ApiResponse({ status: 200, description: '분석 성공' })
  async analyzeEmail(
    @Session() session: any,
    @Param('id') emailId: string,
  ) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const result = await this.emailAnalysisService.analyzeEmail(parseInt(emailId));
      
      if (result.email.userId !== session.userId) {
        return { success: false, message: 'Email not found' };
      }

      return { 
        success: true, 
        isPayment: !!result.paymentReport,
        data: result.paymentReport ? {
          id: result.paymentReport.id,
          emailId: result.email.id,
          subject: result.email.subject,
          amount: result.paymentReport.amount,
          currency: result.paymentReport.currency,
          merchant: result.paymentReport.merchant,
          paymentDate: result.paymentReport.paymentDate,
          cardType: result.paymentReport.cardType,
          paymentType: result.paymentReport.paymentType,
          summary: result.paymentReport.summary,
        } : null,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Post('analyze-batch')
  @ApiOperation({ summary: '이메일 일괄 분석', description: '로그인한 사용자의 미분석 이메일들을 일괄 분석' })
  @ApiQuery({ name: 'limit', required: false, description: '분석할 최대 이메일 수', example: 10 })
  @ApiQuery({ name: 'force', required: false, description: '이미 분석된 것도 다시 분석', example: 'false' })
  async analyzeBatch(
    @Session() session: any,
    @Query('limit') limit?: string,
    @Query('force') force?: string,
  ) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const result = await this.emailAnalysisService.analyzeUserEmails(session.userId, {
        limit: limit ? parseInt(limit) : 10,
        force: force === 'true',
      });

      return { 
        success: true, 
        ...result,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('payments')
  @ApiOperation({ summary: '결제 리포트 목록 조회', description: '페이지네이션과 날짜 필터를 지원하는 결제 리포트 목록' })
  @ApiQuery({ name: 'page', required: false, description: '페이지 번호', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: '페이지당 개수 (최대 100)', example: 20 })
  @ApiQuery({ name: 'year', required: false, description: '연도 필터', example: 2024 })
  @ApiQuery({ name: 'month', required: false, description: '월 필터 (1-12)', example: 12 })
  @ApiQuery({ name: 'day', required: false, description: '일 필터 (1-31)', example: 25 })
  @ApiQuery({ name: 'startDate', required: false, description: '시작일 (YYYY-MM-DD)', example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: false, description: '종료일 (YYYY-MM-DD)', example: '2024-12-31' })
  async getPaymentReports(
    @Session() session: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('day') day?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const result = await this.emailAnalysisService.getUserPaymentReportsPaginated(session.userId, {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        year: year ? parseInt(year) : undefined,
        month: month ? parseInt(month) : undefined,
        day: day ? parseInt(day) : undefined,
        startDate,
        endDate,
      });

      return { 
        success: true,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
        currentPage: result.currentPage,
        limit: result.limit,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
        data: result.data.map(r => ({
          id: r.id,
          emailId: r.emailId,
          subject: r.email?.subject,
          from: r.email?.from,
          amount: r.amount,
          currency: r.currency,
          merchant: r.merchant,
          paymentDate: r.paymentDate,
          cardType: r.cardType,
          paymentType: r.paymentType,
          summary: r.summary,
          createdAt: r.createdAt,
        })),
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('payments/stats/monthly')
  @ApiOperation({ summary: '월별 결제 통계', description: '연도별 월별 결제 금액과 건수 통계' })
  @ApiQuery({ name: 'year', required: false, description: '조회 연도 (기본: 현재 연도)', example: 2024 })
  async getMonthlyStats(
    @Session() session: any,
    @Query('year') year?: string,
  ) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    try {
      const stats = await this.emailAnalysisService.getMonthlyStats(session.userId, targetYear);
      
      const fullStats = Array.from({ length: 12 }, (_, i) => {
        const found = stats.find(s => s.month === i + 1);
        return {
          month: i + 1,
          totalAmount: found?.totalAmount || 0,
          count: found?.count || 0,
        };
      });

      const totalAmount = fullStats.reduce((sum, s) => sum + s.totalAmount, 0);
      const totalCount = fullStats.reduce((sum, s) => sum + s.count, 0);

      return {
        success: true,
        year: targetYear,
        totalAmount,
        totalCount,
        data: fullStats,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('payments/stats/daily')
  @ApiOperation({ summary: '일별 결제 통계', description: '특정 월의 일별 결제 금액과 건수 통계' })
  @ApiQuery({ name: 'year', required: false, description: '조회 연도 (기본: 현재 연도)', example: 2024 })
  @ApiQuery({ name: 'month', required: false, description: '조회 월 (기본: 현재 월)', example: 12 })
  async getDailyStats(
    @Session() session: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1;

    try {
      const stats = await this.emailAnalysisService.getDailyStats(session.userId, targetYear, targetMonth);
      
      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
      
      const fullStats = Array.from({ length: daysInMonth }, (_, i) => {
        const found = stats.find(s => s.day === i + 1);
        return {
          day: i + 1,
          totalAmount: found?.totalAmount || 0,
          count: found?.count || 0,
        };
      });

      const totalAmount = fullStats.reduce((sum, s) => sum + s.totalAmount, 0);
      const totalCount = fullStats.reduce((sum, s) => sum + s.count, 0);

      return {
        success: true,
        year: targetYear,
        month: targetMonth,
        totalAmount,
        totalCount,
        data: fullStats,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('payments/:id')
  @ApiOperation({ summary: '단일 결제 리포트 조회', description: '결제 리포트 상세 정보 조회' })
  @ApiParam({ name: 'id', description: '리포트 ID', example: 1 })
  async getPaymentReport(
    @Session() session: any,
    @Param('id') reportId: string,
  ) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const report = await this.emailAnalysisService.getPaymentReport(parseInt(reportId));
      
      if (!report || report.email?.userId !== session.userId) {
        return { success: false, message: 'Payment report not found' };
      }

      return { 
        success: true, 
        data: {
          id: report.id,
          emailId: report.emailId,
          subject: report.email?.subject,
          from: report.email?.from,
          amount: report.amount,
          currency: report.currency,
          merchant: report.merchant,
          paymentDate: report.paymentDate,
          cardType: report.cardType,
          paymentType: report.paymentType,
          summary: report.summary,
          rawData: report.rawData,
          createdAt: report.createdAt,
        },
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // ==================== 큐 관리 API ====================

  @Get('queue/status')
  @ApiOperation({ summary: '분석 큐 상태 조회', description: '현재 분석 대기 중인 이메일 큐 상태' })
  getQueueStatus() {
    return {
      success: true,
      data: this.emailAnalysisScheduler.getQueueStatus(),
    };
  }

  @Post('queue/enqueue')
  @ApiOperation({ summary: '분석 큐에 이메일 추가', description: '미분석 이메일을 분석 큐에 추가' })
  async triggerEnqueue(@Session() session: any) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const result = await this.emailAnalysisScheduler.triggerEnqueue();
      return { success: true, ...result };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Post('queue/process')
  @ApiOperation({ summary: '분석 큐 처리 트리거', description: '큐에 있는 이메일을 즉시 분석 처리' })
  async triggerProcess(@Session() session: any) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const result = await this.emailAnalysisScheduler.triggerProcess();
      return { success: true, ...result };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Delete('queue')
  @ApiOperation({ summary: '분석 큐 비우기', description: '대기 중인 모든 분석 작업 제거' })
  clearQueue(@Session() session: any) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    const cleared = this.emailAnalysisScheduler.clearQueue();
    return { success: true, cleared };
  }
}
