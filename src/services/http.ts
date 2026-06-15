import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError, ApiResponse } from '@/types/api'

const TOKEN_KEY = 'accessToken'
const DEFAULT_ERROR_MESSAGE = 'Request failed'

type ApiCode = ApiResponse<unknown>['code']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isApiPayload(value: unknown): value is Partial<ApiResponse<unknown>> & Record<string, unknown> {
  return isRecord(value) && ('code' in value || 'message' in value || 'data' in value)
}

function isSuccessCode(code: unknown) {
  const normalized = String(code).trim().toLowerCase()
  if (normalized === '0' || normalized === 'success') return true

  const numericCode = Number(code)
  return Number.isFinite(numericCode) && numericCode >= 200 && numericCode < 300
}

function readString(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function readErrorMessage(payload: unknown, fallback = DEFAULT_ERROR_MESSAGE) {
  // Direct string response (e.g. plain-text error from server)
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim()
  }

  if (isRecord(payload)) {
    for (const key of ['message', 'msg', 'errorMessage', 'error', 'detail', 'title', 'error_description']) {
      const message = readString(payload[key])
      if (message) return message
    }

    for (const key of ['errors', 'validationErrors']) {
      const value = payload[key]
      if (Array.isArray(value)) {
        const message = value.map(readString).filter(Boolean).join('\n')
        if (message) return message
      }
      if (isRecord(value)) {
        const firstMessage = Object.values(value).flatMap((item) => Array.isArray(item) ? item : [item]).map(readString).find(Boolean)
        if (firstMessage) return firstMessage
      }
    }
  }

  return fallback
}

function normalizeCode(code: unknown, fallback: number): ApiCode {
  return typeof code === 'string' || typeof code === 'number' ? code : fallback
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse<unknown>
    if (isApiPayload(payload) && 'code' in payload) {
      if (isSuccessCode(payload.code)) return 'data' in payload ? payload.data : null
      return Promise.reject({
        code: normalizeCode(payload.code, response.status),
        message: readErrorMessage(payload),
        status: response.status,
      } satisfies ApiError)
    }
    return response.data
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const payload = error.response?.data
    const statusCode = error.response?.status

    // Try to extract the API's own error message first; fall back to axios' message only as a last resort.
    const extracted = readErrorMessage(payload, '')
    const fallback = extracted || error.message || DEFAULT_ERROR_MESSAGE

    const apiError: ApiError = {
      code: normalizeCode(payload?.code, statusCode || 500),
      status: statusCode,
      message: fallback,
    }
    if (apiError.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('refreshToken')
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    return Promise.reject(apiError)
  },
)

export function setStoredToken(token: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token)
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('refreshToken')
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}
