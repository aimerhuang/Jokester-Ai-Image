import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError, ApiResponse } from '@/types/api'
import type { LoginResult } from '@/types/auth'

const TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const DEFAULT_ERROR_MESSAGE = 'Request failed'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

type ApiCode = ApiResponse<unknown>['code']
type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

let refreshPromise: Promise<string> | null = null
const tokenRefreshListeners = new Set<(result: LoginResult) => void>()

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
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  if (isRecord(payload)) {
    for (const key of ['message', 'Message', 'msg', 'errorMessage', 'ErrorMessage', 'error', 'Error', 'detail', 'Detail', 'title', 'Title', 'error_description']) {
      const message = readString(payload[key])
      if (message) return message
    }
    for (const key of ['errors', 'Errors', 'validationErrors', 'ValidationErrors']) {
      const value = payload[key]
      if (Array.isArray(value)) {
        const message = value.map(readString).filter(Boolean).join('\n')
        if (message) return message
      }
      if (isRecord(value)) {
        const message = Object.values(value)
          .flatMap((item) => Array.isArray(item) ? item : [item])
          .map(readString)
          .find(Boolean)
        if (message) return message
      }
    }
  }
  return fallback
}

function normalizeCode(code: unknown, fallback: number): ApiCode {
  return typeof code === 'string' || typeof code === 'number' ? code : fallback
}

function readRetryAfterSeconds(value: unknown) {
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  if (typeof value !== 'string' || !value.trim()) return undefined
  const retryAt = Date.parse(value)
  if (Number.isNaN(retryAt)) return undefined
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
}

function readUserMessage(details: unknown) {
  if (!isRecord(details)) return ''
  return readString(details.userMessage ?? details.UserMessage)
}

function toApiError(error: AxiosError<ApiResponse<unknown>>): ApiError {
  const payload = error.response?.data
  const status = error.response?.status
  const code = isRecord(payload) ? payload.code ?? payload.Code : undefined
  const details = isRecord(payload) ? payload.details ?? payload.Details : undefined
  const requestId = isRecord(payload) ? readString(payload.requestId ?? payload.RequestId) : ''
  const retryAfterSeconds = readRetryAfterSeconds(error.response?.headers['retry-after'])
    ?? (isRecord(details) ? readRetryAfterSeconds(details.retryAfterSeconds ?? details.RetryAfterSeconds) : undefined)
  return {
    code: normalizeCode(code, status || 500),
    status,
    message: readUserMessage(details) || readErrorMessage(payload, error.message || DEFAULT_ERROR_MESSAGE),
    requestId: requestId || undefined,
    details,
    retryAfterSeconds,
  }
}

function isAuthLifecycleRequest(url = '') {
  return ['/auth/login', '/auth/register', '/auth/refresh'].some((path) => url.includes(path))
}

function expireSession() {
  if (!getStoredToken() && !getStoredRefreshToken()) return
  clearStoredToken()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:expired'))
}

function apiUrl(path: string) {
  return `${String(API_BASE_URL).replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getStoredToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse<unknown>
    if (isApiPayload(payload) && 'code' in payload) {
      if (isSuccessCode(payload.code)) return 'data' in payload ? payload.data : null
      const details = payload.details
      return Promise.reject({
        code: normalizeCode(payload.code, response.status),
        message: readUserMessage(details) || readErrorMessage(payload),
        status: response.status,
        requestId: readString(payload.requestId) || undefined,
        details,
        retryAfterSeconds: readRetryAfterSeconds(response.headers['retry-after'])
          ?? (isRecord(details) ? readRetryAfterSeconds(details.retryAfterSeconds ?? details.RetryAfterSeconds) : undefined),
      } satisfies ApiError)
    }
    return response.data
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined
    const canRefresh = error.response?.status === 401
      && originalRequest
      && !originalRequest._retry
      && !isAuthLifecycleRequest(originalRequest.url)
      && Boolean(getStoredRefreshToken())

    if (canRefresh) {
      originalRequest._retry = true
      try {
        const token = await refreshAccessToken()
        originalRequest.headers.Authorization = `Bearer ${token}`
        if (originalRequest.url?.includes('/auth/logout')) {
          originalRequest.headers['X-Refresh-Token'] = getStoredRefreshToken() || ''
        }
        return http(originalRequest)
      } catch {
        // refreshAccessToken owns session expiration for all waiting requests.
      }
    } else if (error.response?.status === 401 && !isAuthLifecycleRequest(originalRequest?.url)) {
      expireSession()
    }

    return Promise.reject(toApiError(error))
  },
)

export function setStoredToken(token: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token)
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function subscribeToTokenRefresh(listener: (result: LoginResult) => void) {
  tokenRefreshListeners.add(listener)
  return () => tokenRefreshListeners.delete(listener)
}

export function refreshAccessToken() {
  if (refreshPromise) return refreshPromise
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return Promise.reject(new Error('Refresh token is missing'))

  refreshPromise = axios.post<ApiResponse<LoginResult>>(
    apiUrl('/auth/refresh'),
    { refreshToken },
    { timeout: 30000 },
  ).then((response) => {
    const payload = response.data
    if (!isApiPayload(payload) || !('code' in payload) || !isSuccessCode(payload.code) || !payload.data) {
      throw new Error(readErrorMessage(payload, 'Token refresh failed'))
    }
    const result = payload.data as LoginResult
    if (!result.accessToken || !result.refreshToken) throw new Error('Token refresh response is incomplete')
    setStoredToken(result.accessToken, result.refreshToken)
    tokenRefreshListeners.forEach((listener) => listener(result))
    return result.accessToken
  }).catch((error) => {
    expireSession()
    throw error
  }).finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}
