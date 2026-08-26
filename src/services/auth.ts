import { http, getStoredRefreshToken } from './http'
import type {
  LoginRequest,
  LoginResult,
  RegisterRequest,
  RegisterResult,
  SendEmailCodeResult,
  SendRegisterEmailCodeRequest,
  UserProfile,
} from '@/types/auth'

export function login(payload: LoginRequest) {
  return http.post<unknown, LoginResult>('/auth/login', payload)
}

export function register(payload: RegisterRequest) {
  return http.post<unknown, RegisterResult>('/auth/register', payload)
}

export function sendEmailCode(payload: SendRegisterEmailCodeRequest) {
  return http.post<unknown, SendEmailCodeResult>('/auth/register/email-code', payload)
}

export function getCurrentUser() {
  return http.get<unknown, UserProfile>('/auth/profile')
}

export function logout() {
  const refreshToken = getStoredRefreshToken()
  return http.post<unknown, null>('/auth/logout', null, {
    headers: refreshToken ? { 'X-Refresh-Token': refreshToken } : undefined,
  })
}
