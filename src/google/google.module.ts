import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleController } from './google.controller';
import { GoogleService } from './google.service';
import { GoogleScheduler } from './google.scheduler';
import { AuthModule } from '../auth/auth.module';
import { Email } from './entities/email.entity';
import { EmailAttachment } from './entities/email-attachment.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Email, EmailAttachment]),
  ],
  controllers: [GoogleController],
  providers: [GoogleService, GoogleScheduler],
  exports: [GoogleService],
})
export class GoogleModule {}
