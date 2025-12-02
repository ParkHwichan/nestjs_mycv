import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleToken } from '../google/google-token.entity';
import { User } from '../users/users.entity';

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  constructor(
    private configService: ConfigService,
    @InjectRepository(GoogleToken)
    private googleTokenRepo: Repository<GoogleToken>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '';
    this.redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI') || 'http://localhost:3000/auth/google/callback';

    console.log('[AuthService] Initialized');
    console.log('  Client ID:', this.clientId?.substring(0, 20) + '...');
    console.log('  Redirect URI:', this.redirectUri);
  }

  /**
   * Google 인증 URL 생성
   */
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

    if (state) {
      params.append('state', state);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Authorization Code → Token 교환
   */
  async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
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
      console.error('[AuthService] Token exchange failed:', data);
      throw new Error(data.error_description || data.error || 'Token exchange failed');
    }

    return data as GoogleTokens;
  }

  /**
   * Google 사용자 정보 조회
   */
  async getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Failed to get user info (${response.status})`);
    }

    return response.json();
  }

  /**
   * Google 로그인 처리 - 사용자 생성/업데이트 + 토큰 저장
   */
  async handleGoogleLogin(tokens: GoogleTokens, userInfo: GoogleUserInfo): Promise<User> {
    // 1. 기존 사용자 찾기 (googleId 또는 email로)
    let user = await this.userRepo.findOne({
      where: [
        { googleId: userInfo.id },
        { email: userInfo.email },
      ],
      relations: ['googleToken'],
    });

    if (user) {
      // 기존 사용자 업데이트
      user.googleId = userInfo.id;
      user.name = userInfo.name || user.name;
      user.picture = userInfo.picture || user.picture;
      user.provider = 'google';
      await this.userRepo.save(user);
      console.log('[AuthService] User updated:', user.email);
    } else {
      // 새 사용자 생성
      user = this.userRepo.create({
        email: userInfo.email,
        name: userInfo.name || '',
        picture: userInfo.picture || '',
        googleId: userInfo.id,
        provider: 'google',
      });
      await this.userRepo.save(user);
      console.log('[AuthService] User created:', user.email);
    }

    // 2. 토큰 저장/업데이트
    let googleToken = await this.googleTokenRepo.findOne({
      where: { userId: user.id },
    });

    if (googleToken) {
      // 기존 토큰 업데이트
      googleToken.accessToken = tokens.access_token;
      if (tokens.refresh_token) {
        googleToken.refreshToken = tokens.refresh_token;
      }
      googleToken.expiresAt = Date.now() + (tokens.expires_in * 1000);
      googleToken.scope = tokens.scope;
      googleToken.email = userInfo.email;
      googleToken.name = userInfo.name || '';
      googleToken.picture = userInfo.picture || '';
    } else {
      // 새 토큰 생성
      googleToken = this.googleTokenRepo.create({
        googleId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name || '',
        picture: userInfo.picture || '',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        scope: tokens.scope,
        userId: user.id,
      });
    }

    await this.googleTokenRepo.save(googleToken);
    console.log('[AuthService] Token saved for user:', user.id);
    console.log('  - Refresh Token:', tokens.refresh_token ? 'YES' : 'NO');

    return user;
  }

  /**
   * 사용자 조회 (with token)
   */
  async getUserById(userId: number): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id: userId },
      relations: ['googleToken'],
    });
  }

  /**
   * Refresh Token으로 Access Token 갱신
   */
  async refreshAccessToken(userId: number): Promise<GoogleToken> {
    const googleToken = await this.googleTokenRepo.findOne({
      where: { userId },
    });

    if (!googleToken?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const params = new URLSearchParams({
      refresh_token: googleToken.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || 'Token refresh failed');
    }

    // 새 토큰 저장
    googleToken.accessToken = data.access_token;
    googleToken.expiresAt = Date.now() + (data.expires_in * 1000);
    await this.googleTokenRepo.save(googleToken);

    console.log('[AuthService] Token refreshed for user:', userId);
    return googleToken;
  }

  /**
   * 유효한 Access Token 가져오기 (만료시 자동 갱신)
   */
  async getValidAccessToken(userId: number): Promise<string> {
    const token = await this.googleTokenRepo.findOne({ where: { userId } });
    
    if (!token) {
      throw new Error('No token found');
    }

    // 토큰이 만료되었으면 갱신
    if (Date.now() > Number(token.expiresAt)) {
      console.log('[Auth] Token expired, refreshing...');
      const refreshed = await this.refreshAccessToken(userId);
      return refreshed.accessToken;
    }

    return token.accessToken;
  }

  /**
   * Google 토큰이 있는 모든 사용자 조회 (크론용)
   */
  async getAllUsersWithGoogleToken(): Promise<{ id: number; email: string }[]> {
    const tokens = await this.googleTokenRepo.find({
      where: {},
      select: ['userId'],
    });

    const userIds = tokens.map(t => t.userId);
    if (userIds.length === 0) return [];

    const users = await this.userRepo.find({
      where: userIds.map(id => ({ id })),
      select: ['id', 'email'],
    });

    return users;
  }
}

