import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService, OAUTH_PROVIDERS } from './auth.service';
import { AuthScheduler } from './auth.scheduler';
import { User } from '../users/users.entity';
import { MailAccount } from '../mail/entities/mail-account.entity';
import { OAuthIdentity } from './oauth_identities.entity';
import { GoogleOAuthProvider } from './providers/google-oauth.provider';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, MailAccount, OAuthIdentity]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthScheduler, GoogleOAuthProvider,
    {
      provide: OAUTH_PROVIDERS,
      useFactory: (google: GoogleOAuthProvider) => [google],
      inject: [GoogleOAuthProvider],
    },
  ],
  exports: [AuthService, AuthScheduler],
})
export class AuthModule {}

