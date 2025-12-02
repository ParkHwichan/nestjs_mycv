import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../users/users.entity';
import { GoogleToken } from '../google/google-token.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, GoogleToken]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

