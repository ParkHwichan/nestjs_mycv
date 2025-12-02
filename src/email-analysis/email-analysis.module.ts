import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailAnalysisController } from './email-analysis.controller';
import { EmailAnalysisService } from './email-analysis.service';
import { EmailAnalysisScheduler } from './email-analysis.scheduler';
import { OpenaiModule } from '../openai/openai.module';
import { Email } from '../google/entities/email.entity';
import { EmailAttachment } from '../google/entities/email-attachment.entity';
import { PaymentReport } from '../google/entities/payment-report.entity';

@Module({
  imports: [
    OpenaiModule,
    TypeOrmModule.forFeature([Email, EmailAttachment, PaymentReport]),
  ],
  controllers: [EmailAnalysisController],
  providers: [EmailAnalysisService, EmailAnalysisScheduler],
  exports: [EmailAnalysisService],
})
export class EmailAnalysisModule {}

