export interface UserMembership {
  tierCode: string
  status: string
  expiresAt: string
}

export interface UserProfile {
  id: number
  userName: string
  nickName: string
  email?: string | null
  avatarUrl?: string | null
  signature?: string | null
  pointBalance: number
  isSuperAdmin: boolean
  membership?: UserMembership | null
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
  email: string
  emailCode: string
  password: string
}

export interface RegisterResult {
  userId: number
}

export interface SendRegisterEmailCodeRequest {
  email: string
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
