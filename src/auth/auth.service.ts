// auth/auth.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { User } from '../users/users.entity';
import {
  OAuthProvider,
  OAuthProviderName,
  OAuthTokens,
  OAuthUserInfo,
} from './interfaces/oauth.provider';
import { MailAccount, MailProvider } from '../mail/entities/mail-account.entity';

export const OAUTH_PROVIDERS = 'OAUTH_PROVIDERS';

@Injectable()
export class AuthService {
  private readonly providerMap = new Map<OAuthProviderName, OAuthProvider>();
  private readonly defaultOAuthProvider: OAuthProviderName = 'google';
  private readonly mailProvider: MailProvider = 'gmail';

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MailAccount)
    private readonly mailAccountRepo: Repository<MailAccount>,
    @Inject(OAUTH_PROVIDERS) providers: OAuthProvider[],
  ) {
    providers.forEach((p) => this.providerMap.set(p.name, p));
  }

  private getProvider(name: OAuthProviderName): OAuthProvider {
    const provider = this.providerMap.get(name);
    if (!provider) {
      throw new Error(`Unsupported provider: ${name}`);
    }
    return provider;
  }

  // =========================================================
  // 1) Authorization URL
  // =========================================================
  getAuthorizationUrl(providerName: OAuthProviderName, state?: string): string {
    const provider = this.getProvider(providerName);
    return provider.getAuthorizationUrl(state);
  }

  // =========================================================
  // 2) 공통 OAuth 콜백 처리
  //    - code -> tokens -> userInfo -> User upsert -> MailAccount upsert(optional)
  // =========================================================
  async handleOAuthCallback(
    providerName: OAuthProviderName,
    code: string,
  ): Promise<{ user: User; mailAccount?: MailAccount }> {
    const provider = this.getProvider(providerName);

    const tokens: OAuthTokens = await provider.exchangeCodeForTokens(code);
    const userInfo: OAuthUserInfo = await provider.getUserInfo(tokens);

    let user = await this.userRepo.findOne({
      where: [
        { email: userInfo.email },
        // 필요하면 provider별 id 컬럼을 User에 추가해서 같이 조회
        // { googleId: userInfo.provider === 'google' ? userInfo.providerUserId : undefined },
      ],
    });

    if (user) {
      // 기존 유저 업데이트
      user.name = userInfo.name || user.name;
      user.picture = userInfo.picture || user.picture;
      user.provider = providerName;
      // provider별 id를 User에 박고 싶으면 여기서 처리
      if (providerName === 'google') {
        (user as any).googleId = userInfo.providerUserId;
      }
      await this.userRepo.save(user);
      console.log('[AuthService] User updated:', user.email);
    } else {
      // 신규 생성
      user = this.userRepo.create({
        email: userInfo.email,
        name: userInfo.name || '',
        picture: userInfo.picture || '',
        provider: providerName,
        ...(providerName === 'google'
          ? { googleId: userInfo.providerUserId }
          : {}),
      } as User);
      await this.userRepo.save(user);
      console.log('[AuthService] User created:', user.email);
    }

    let mailAccount: MailAccount | undefined;
    if (provider.upsertMailAccount) {
      mailAccount = (await provider.upsertMailAccount(user, tokens, userInfo)) as MailAccount;
      console.log(
        '[AuthService] Mail account saved for user:',
        user.id,
        '- provider:',
        providerName,
      );
    }

    return { user, mailAccount };
  }

  // =========================================================
  // 3) 사용자 조회
  // =========================================================
  async getUserById(userId: number): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id: userId },
      relations: ['mailAccounts'],
    });
  }

  // =========================================================
  // 4) Mail 관련 헬퍼 (gmail/outlook에서만 동작)
  // =========================================================

  /**
   * Gmail용 유효 토큰 반환 (만료 시 자동 리프레시)
   */
  async getValidAccessToken(userId: number): Promise<string> {
    return this.getValidMailAccessToken(this.defaultOAuthProvider, userId);
  }

  /**
   * 단일 사용자 토큰 리프레시 후 MailAccount 반환
   */
  async refreshAccessToken(userId: number): Promise<MailAccount> {
    await this.getValidMailAccessToken(this.defaultOAuthProvider, userId);

    const account = await this.mailAccountRepo.findOne({
      where: { userId, provider: this.mailProvider, isActive: true },
    });

    if (!account) {
      throw new Error('No active mail account found for user');
    }

    return account;
  }

  /**
   * Dev/cron용 전체 토큰 리프레시
   */
  async refreshAllTokens(): Promise<{ success: number; failed: number }> {
    return this.refreshAllMailTokens(this.defaultOAuthProvider);
  }

  /**
   * 현재 사용자 토큰 상태 확인
   */
  async checkTokenValidity(userId: number) {
    return this.checkMailTokenValidity(this.defaultOAuthProvider, userId);
  }

  /**
   * Gmail 토큰을 가진 사용자 목록 조회
   */
  async getAllUsersWithGmailAccount(): Promise<User[]> {
    const accounts = await this.mailAccountRepo.find({
      where: { provider: this.mailProvider, isActive: true },
      select: ['userId'],
    });

    const userIds = [...new Set(accounts.map((a) => a.userId))];
    if (userIds.length === 0) return [];

    return this.userRepo.findBy({ id: In(userIds) });
  }

  async getValidMailAccessToken(
    providerName: OAuthProviderName,
    userId: number,
  ): Promise<string> {
    const provider = this.getProvider(providerName);
    if (!provider.getValidMailAccessToken) {
      throw new Error(`Provider ${providerName} does not support mail access token`);
    }
    return provider.getValidMailAccessToken(userId);
  }

  async refreshAllMailTokens(
    providerName: OAuthProviderName,
  ): Promise<{ success: number; failed: number }> {
    const provider = this.getProvider(providerName);
    if (!provider.refreshAllMailTokens) {
      throw new Error(`Provider ${providerName} does not support mail token refresh`);
    }
    return provider.refreshAllMailTokens();
  }

  async checkMailTokenValidity(
    providerName: OAuthProviderName,
    userId: number,
  ): Promise<{
    hasToken: boolean;
    hasRefreshToken: boolean;
    isExpired: boolean;
    needsReauth: boolean;
  }> {
    const provider = this.getProvider(providerName);
    if (!provider.checkMailTokenValidity) {
      throw new Error(`Provider ${providerName} does not support mail token validity check`);
    }
    return provider.checkMailTokenValidity(userId);
  }
}
