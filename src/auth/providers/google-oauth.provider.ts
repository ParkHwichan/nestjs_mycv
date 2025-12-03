// auth/providers/google-oauth.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailAccount } from '../../mail/entities/mail-account.entity';
import { User } from '../../users/users.entity';
import { OAuthProvider, OAuthTokens, OAuthUserInfo } from '../interfaces/oauth.provider';

@Injectable()
export class GoogleOAuthProvider implements OAuthProvider {
  readonly name: OAuthProvider['name'] = 'google';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(MailAccount)
    private readonly mailAccountRepo: Repository<MailAccount>,
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '';
    this.redirectUri =
      this.configService.get<string>('GOOGLE_REDIRECT_URI') ||
      'http://localhost:3000/auth/google/callback';
  }

  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    if (state) params.append('state', state);

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || data.error || 'Token exchange failed');
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
      idToken: data.id_token,
      raw: data,
    };
  }

  async getUserInfo(tokens: OAuthTokens): Promise<OAuthUserInfo> {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to get user info (${res.status})`);
    }

    const data = await res.json();
    return {
      provider: 'google',
      providerUserId: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  }

  /**
   * MailAccount upsert (Gmail)
   */
  async upsertMailAccount(user: User, tokens: OAuthTokens, info: OAuthUserInfo) {
    let mailAccount = await this.mailAccountRepo.findOne({
      where: { userId: user.id, provider: 'gmail', isActive: true },
    });

    if (!mailAccount) {
      mailAccount = this.mailAccountRepo.create({
        userId: user.id || 0,
        provider: 'gmail',
        email: info.email,
        name: info.name || '',
        picture: info.picture || '',
        oauthId: info.providerUserId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || '',
        expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
        scope: tokens.scope,
        isActive: true,
        needsReauth: false,
      });
    } else {
      mailAccount.email = info.email;
      mailAccount.name = info.name || mailAccount.name;
      mailAccount.picture = info.picture || mailAccount.picture;
      mailAccount.oauthId = info.providerUserId;
      mailAccount.accessToken = tokens.accessToken;
      if (tokens.refreshToken) mailAccount.refreshToken = tokens.refreshToken;
      if (tokens.expiresIn) {
        mailAccount.expiresAt = Date.now() + tokens.expiresIn * 1000;
      }
      if (tokens.scope) mailAccount.scope = tokens.scope;
      mailAccount.isActive = true;
      mailAccount.needsReauth = false;
    }

    await this.mailAccountRepo.save(mailAccount);
    return mailAccount;
  }

  async getValidMailAccessToken(userId: number): Promise<string> {
    const mailAccount = await this.mailAccountRepo.findOne({
      where: { userId, provider: 'gmail', isActive: true },
    });

    if (!mailAccount) {
      throw new Error('No active gmail account found for user');
    }

    const now = Date.now();
    const expiresAt = mailAccount.expiresAt ? Number(mailAccount.expiresAt) : 0;
    const isExpired =
      !mailAccount.accessToken || !expiresAt || now >= expiresAt - 60_000; // refresh 1 minute early

    if (!isExpired) {
      return mailAccount.accessToken as string;
    }

    const refreshed = await this.refreshMailAccountToken(mailAccount);
    return refreshed.accessToken as string;
  }

  async refreshAllMailTokens(): Promise<{ success: number; failed: number }> {
    const accounts = await this.mailAccountRepo.find({
      where: { provider: 'gmail', isActive: true },
    });

    let success = 0;
    let failed = 0;

    for (const account of accounts) {
      try {
        await this.refreshMailAccountToken(account);
        success++;
      } catch (err) {
        failed++;
        account.needsReauth = true;
        await this.mailAccountRepo.save(account);
        console.error('[GoogleOAuthProvider] Refresh failed:', err.message);
      }
    }

    return { success, failed };
  }

  async checkMailTokenValidity(userId: number) {
    const mailAccount = await this.mailAccountRepo.findOne({
      where: { userId, provider: 'gmail', isActive: true },
    });

    if (!mailAccount) {
      return {
        hasToken: false,
        hasRefreshToken: false,
        isExpired: true,
        needsReauth: true,
      };
    }

    const expiresAt = mailAccount.expiresAt ? Number(mailAccount.expiresAt) : 0;
    const now = Date.now();
    const isExpired = !expiresAt || now >= expiresAt;

    return {
      hasToken: !!mailAccount.accessToken,
      hasRefreshToken: !!mailAccount.refreshToken,
      isExpired,
      needsReauth: mailAccount.needsReauth || !mailAccount.refreshToken || isExpired,
    };
  }

  private async refreshMailAccountToken(mailAccount: MailAccount): Promise<MailAccount> {
    if (!mailAccount.refreshToken) {
      mailAccount.needsReauth = true;
      await this.mailAccountRepo.save(mailAccount);
      throw new Error('Refresh token is missing; re-authentication required');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: mailAccount.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      mailAccount.needsReauth = true;
      await this.mailAccountRepo.save(mailAccount);
      throw new Error(data.error_description || data.error || 'Failed to refresh token');
    }

    mailAccount.accessToken = data.access_token;
    mailAccount.expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : 0;
    if (data.scope) {
      mailAccount.scope = data.scope;
    }
    mailAccount.needsReauth = false;

    await this.mailAccountRepo.save(mailAccount);
    return mailAccount;
  }
}
