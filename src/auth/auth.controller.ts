import { Controller, Get, Post, Query, Res, Session } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthScheduler } from './auth.scheduler';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private authScheduler: AuthScheduler,
  ) {}

  @Get('google')
  @ApiOperation({ summary: 'Google login', description: 'Redirect to Google OAuth login page' })
  async googleLogin(@Res() res: Response) {
    const authUrl = this.authService.getAuthorizationUrl('google');
    console.log('\n[Auth] Google login start');
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
      const { user, mailAccount } = await this.authService.handleOAuthCallback('google', code);
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
  @ApiOperation({ summary: 'Current user info', description: 'Return current session user profile and token status' })
  async me(@Session() session: any) {
    if (!session.userId) {
      return { logged_in: false };
    }

    const user = await this.authService.getUserById(session.userId);
    if (!user) {
      return { logged_in: false };
    }

    const mailAccount = user.mailAccounts?.find((acc) => acc.provider === 'gmail');
    const isExpired = mailAccount?.expiresAt ? Date.now() > Number(mailAccount.expiresAt) : !mailAccount;

    return {
      logged_in: true,
      needs_reauth: user.needsReauth,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        provider: user.provider,
      },
      token_status: {
        has_refresh_token: !!mailAccount?.refreshToken,
        is_expired: isExpired,
        expires_at: mailAccount?.expiresAt ? new Date(Number(mailAccount.expiresAt)).toISOString() : null,
      },
      ...(user.needsReauth && {
        message: 'Google session expired. Please re-authenticate.',
      }),
    };
  }

  @Get('logout')
  @ApiOperation({ summary: 'Logout', description: 'Clear session and redirect home' })
  async logout(@Session() session: any, @Res() res: Response) {
    console.log('[Auth] Logout:', session.user?.email);
    session.userId = null;
    session.user = null;
    res.redirect('/');
  }

  @Get('dev-login')
  @ApiOperation({ summary: '[dev] Test login', description: 'Login as an existing DB user (dev only)' })
  @ApiQuery({ name: 'userId', required: false, description: 'User ID to login (defaults to first)', example: 1 })
  async devLogin(
    @Session() session: any,
    @Query('userId') userId?: string,
  ) {
    if (process.env.NODE_ENV === 'production') {
      return { success: false, message: 'Not available in production' };
    }

    try {
      let user;

      if (userId) {
        user = await this.authService.getUserById(parseInt(userId, 10));
      } else {
        const users = await this.authService.getAllUsersWithGmailAccount();
        if (users.length > 0) {
          user = await this.authService.getUserById(users[0].id);
        }
      }

      if (!user) {
        return { success: false, message: 'No user found in DB' };
      }

      session.userId = user.id;
      session.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      };

      console.log('[Auth] Dev login:', user.email);

      return {
        success: true,
        message: `Logged in as ${user.email}`,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('dev-users')
  @ApiOperation({ summary: '[dev] User list', description: 'List users with Gmail tokens (dev only)' })
  async devUsers() {
    if (process.env.NODE_ENV === 'production') {
      return { success: false, message: 'Not available in production' };
    }

    try {
      const users = await this.authService.getAllUsersWithGmailAccount();
      return { success: true, users };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Post('refresh-all-tokens')
  @ApiOperation({
    summary: '[admin] Refresh all tokens',
    description: 'Refresh Google tokens for all users; marks needsReauth on failure',
  })
  async refreshAllTokens(@Session() session: any) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const result = await this.authScheduler.triggerTokenRefresh();
      return {
        success: true,
        message: 'Token refresh completed',
        refreshed: result.success,
        failed: result.failed,
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  @Get('token-status')
  @ApiOperation({
    summary: 'Token status check',
    description: 'Return token availability/expiry flags for the current user',
  })
  async tokenStatus(@Session() session: any) {
    if (!session.userId) {
      return { success: false, message: 'Not logged in' };
    }

    try {
      const status = await this.authService.checkTokenValidity(session.userId);
      return { success: true, ...status };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}
