export interface UserProfile {
  id?: number | string
  email: string
  username?: string
  displayName?: string
  avatarUrl?: string
  credits?: number
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  user?: UserProfile
}

export interface RegisterRequest {
  email: string
  username: string
  nickname: string
  password: string
  EmailCode: string
}

export interface ChangePasswordRequest {
  oldPassword: string
  newPassword: string
}

export interface UpdateNicknameRequest {
  nickname: string
  username: string
}
