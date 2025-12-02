import { Controller, Get, Query, Res, Session } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('google')
  @ApiOperation({ summary: 'Google 로그인', description: 'Google OAuth 로그인 페이지로 리다이렉트' })
  async googleLogin(@Res() res: Response) {
    const authUrl = this.authService.getAuthorizationUrl();
    console.log('\n[Auth] Google 로그인 시작');
    res.redirect(authUrl);
  }

  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Session() session: any,
    @Res() res: Response,
  ) {
    console.log('\n[Auth] Google callback received');

    if (error) {
      console.error('[Auth] Error:', error);
      return res.redirect('/?error=' + encodeURIComponent(error));
    }

    if (!code) {
      return res.redirect('/?error=no_code');
    }

    try {
      const tokens = await this.authService.exchangeCodeForTokens(code);
      console.log('[Auth] Token exchange success');

      const userInfo = await this.authService.getGoogleUserInfo(tokens.access_token);
      console.log('[Auth] User info:', userInfo.email);

      const user = await this.authService.handleGoogleLogin(tokens, userInfo);
      console.log('[Auth] User saved to DB:', user.id);

      session.userId = user.id;
      session.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      };

      console.log('[Auth] Login complete!');
      res.redirect('/');
    } catch (err) {
      console.error('[Auth] Login failed:', err.message);
      res.redirect('/?error=' + encodeURIComponent(err.message));
    }
  }

  @Get('me')
  @ApiOperation({ summary: '현재 사용자 정보', description: '로그인한 사용자의 정보와 토큰 상태 조회' })
  async me(@Session() session: any) {
    if (!session.userId) {
      return { logged_in: false };
    }

    const user = await this.authService.getUserById(session.userId);
    if (!user) {
      return { logged_in: false };
    }

    const token = user.googleToken;
    const isExpired = token ? Date.now() > token.expiresAt : true;

    return {
      logged_in: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        provider: user.provider,
      },
      token_status: {
        has_refresh_token: !!token?.refreshToken,
        is_expired: isExpired,
        expires_at: token?.expiresAt ? new Date(Number(token.expiresAt)).toISOString() : null,
      },
    };
  }

  @Get('refresh')
  @ApiOperation({ summary: '토큰 갱신', description: 'Google OAuth 액세스 토큰 갱신' })
  async refresh(@Session() session: any) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const token = await this.authService.refreshAccessToken(session.userId);
      return {
        success: true,
        message: 'Token refreshed',
        expires_at: new Date(Number(token.expiresAt)).toISOString(),
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('logout')
  @ApiOperation({ summary: '로그아웃', description: '세션 종료 후 홈으로 리다이렉트' })
  async logout(@Session() session: any, @Res() res: Response) {
    console.log('[Auth] Logout:', session.user?.email);
    session.userId = null;
    session.user = null;
    res.redirect('/');
  }
}
