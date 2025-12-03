import { MailAccount } from "src/mail/entities/mail-account.entity";
import { User } from "src/users/users.entity";

// auth/interfaces/oauth-provider.interface.ts
export type OAuthProviderName = 'google' // | 'github' | 'kakao' | 'naver' | 'apple';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  idToken?: string;
  raw?: any; // provider 원본 응답이 필요할 때 옵션
}

export interface OAuthUserInfo {
  provider: OAuthProviderName;
  providerUserId: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface OAuthProvider {
  readonly name: OAuthProviderName;
  

  getAuthorizationUrl(state?: string): string;
  exchangeCodeForTokens(code: string): Promise<OAuthTokens>;
  getUserInfo(tokens: OAuthTokens): Promise<OAuthUserInfo>;

  /**
   * 필요하다면 여기서 MailAccount 같은 provider-specific 계정까지 업데이트
   * (안 쓰는 provider 는 빈 구현만)
   */
  upsertMailAccount?(user: User, tokens: OAuthTokens, info: OAuthUserInfo): Promise<MailAccount | void>;
  getValidMailAccessToken?(userId: number): Promise<string>;
  refreshAllMailTokens?(): Promise<{ success: number; failed: number }>;
  checkMailTokenValidity?(userId: number): Promise<{
    hasToken: boolean;
    hasRefreshToken: boolean;
    isExpired: boolean;
    needsReauth: boolean;
  }>;

}
