import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { User } from './users/users.entity';
import { Report } from './reports/reports.entity';
import { GoogleToken } from './google/google-token.entity';
import { Email } from './google/entities/email.entity';
import { EmailAttachment } from './google/entities/email-attachment.entity';
import { PaymentReport } from './google/entities/payment-report.entity';
import { AuthModule } from './auth/auth.module';
import { GoogleModule } from './google/google.module';
import { OpenaiModule } from './openai/openai.module';
import { EmailAnalysisModule } from './email-analysis/email-analysis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    UsersModule, 
    ReportsModule,
    AuthModule,
    GoogleModule, 
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', ''),
        database: configService.get('DB_DATABASE', 'mycv'),
        entities: [User, Report, GoogleToken, Email, EmailAttachment, PaymentReport],
        synchronize: configService.get('NODE_ENV') !== 'production',
      }),
    }), 
    OpenaiModule,
    EmailAnalysisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
