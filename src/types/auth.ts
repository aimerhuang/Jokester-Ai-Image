export interface UserProfile {
  id: number
  userName: string
  nickName: string
  email?: string | null
  avatarUrl?: string | null
  signature?: string | null
  pointBalance: number
  isSuperAdmin: boolean
}

export interface SiteAccess {
  id: number
  siteCode: string
  siteName: string
}

export interface LoginRequest {
  userName: string
  password: string
}

export interface LoginResult {
  sessionId?: string | null
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt?: string
  user: UserProfile
  sites: SiteAccess[]
  permissions: string[]
}

export interface RegisterRequest {
  userName: string
  nickName: string
  password: string
  email: string
  emailCode: string
  acceptedPrivacyPolicy: true
  privacyPolicyVersion: string
  acceptedTermsOfService: true
  termsOfServiceVersion: string
  clientPlatform: 'web'
  locale: string
}

export interface RegisterResult {
  userId: number
}

export interface CaptchaChallenge {
  captchaId: string
  imageBase64: string
  mimeType: string
  expiresInSeconds: number
}

export interface SendRegisterEmailCodeRequest {
  email: string
  captchaId: string
  captchaAnswer: string
}

export interface SendEmailCodeResult {
  retryAfterSeconds: number
}

export interface ChangePasswordRequest {
  password: string
}

export interface UpdateNicknameRequest {
  userName: string
  nickName: string
}
