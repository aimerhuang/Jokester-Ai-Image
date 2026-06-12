import { http } from './http'
import type { ChangePasswordRequest, UpdateNicknameRequest } from '@/types/auth'

export function updatePassword(userId: string | number, payload: ChangePasswordRequest) {
  return http.put<unknown, null>(`/Users/${userId}/password`, { password: payload.newPassword })
}

export function updateNickname(userId: string | number, payload: UpdateNicknameRequest) {
  return http.put<unknown, null>(`/users/${userId}/nickname`, payload)
}

export function uploadAvatar(userId: string | number, file: File) {
  const form = new FormData()
  form.append('File', file)
  return http.post<unknown, { url: string }>(`/users/${userId}/avatar`, form)
}
