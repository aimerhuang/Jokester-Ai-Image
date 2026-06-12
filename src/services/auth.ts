import { http } from './http'
import type { LoginRequest, LoginResult, RegisterRequest, UserProfile } from '@/types/auth'

type RawUserProfile = UserProfile & {
  userName?: string
  nickname?: string
  name?: string
  emailAddress?: string
  mail?: string
  avatar?: string
  avatarURL?: string
  avatar_url?: string
  credit?: number
  balance?: number
}

function normalizeUserProfile(user: RawUserProfile): UserProfile {
  return {
    ...user,
    email: user.email || user.emailAddress || user.mail || '',
    username: user.username || user.userName,
    displayName: user.displayName || user.nickname || user.name,
    avatarUrl: user.avatarUrl || user.avatarURL || user.avatar_url || user.avatar,
    credits: user.credits ?? user.credit ?? user.balance,
  }
}

export async function login(payload: LoginRequest) {
  const result = await http.post<unknown, LoginResult>('/auth/login', payload)
  if (result.user) result.user = normalizeUserProfile(result.user as RawUserProfile)
  return result
}

export async function register(payload: RegisterRequest) {
  const result = await http.post<unknown, LoginResult | null>('/auth/register', payload)
  if (result?.user) result.user = normalizeUserProfile(result.user as RawUserProfile)
  return result
}

export function sendEmailCode(email: string) {
  return http.post<unknown, null>('/auth/register/email-code', { email })
}

export async function getCurrentUser() {
  const user = await http.get<unknown, RawUserProfile>('/auth/profile')
  return normalizeUserProfile(user)
}

export function logout() {
  return http.post<unknown, null>('/auth/logout')
}
