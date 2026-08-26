import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError, ApiFailureResponse, ApiResponse, ApiSuccessResponse } from '@/types/api'
import type { LoginResult } from '@/types/auth'

const TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const DEFAULT_ERROR_MESSAGE = 'Request failed'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const CLIENT_VERSION = __APP_VERSION__
const CLIENT_BUILD = __APP_BUILD__

type ApiCode = ApiSuccessResponse<unknown>['code'] | ApiFailureResponse['code'] | number
type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
  _accessToken?: string
  skipAuthRefreshReplay?: boolean
}
export type SafeRequestConfig = AxiosRequestConfig & { skipAuthRefreshReplay?: boolean }
export const noAuthRefreshReplayConfig: SafeRequestConfig = { skipAuthRefreshReplay: true }
type ApiPayloadShape = Record<string, unknown> & {
  code?: unknown
  message?: unknown
  requestId?: unknown
  data?: unknown
  details?: unknown
}

let activeRefresh: { refreshToken: string; promise: Promise<string> } | null = null
const tokenRefreshListeners = new Set<(result: LoginResult) => void>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isApiPayload(value: unknown): value is ApiPayloadShape {
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
  const rawPayload = error.response?.data as unknown
  const payload = isRecord(rawPayload) ? rawPayload : undefined
  const status = error.response?.status
  const code = payload?.code ?? payload?.Code
  const details = payload?.details ?? payload?.Details
  const requestId = payload ? readString(payload.requestId ?? payload.RequestId) : ''
  const retryAfterSeconds = readRetryAfterSeconds(error.response?.headers['retry-after'])
    ?? (isRecord(details) ? readRetryAfterSeconds(details.retryAfterSeconds ?? details.RetryAfterSeconds) : undefined)
  return {
    code: normalizeCode(code, status || 500),
    status,
    message: readUserMessage(details) || readErrorMessage(rawPayload, error.message || DEFAULT_ERROR_MESSAGE),
    requestId: requestId || undefined,
    details,
    retryAfterSeconds,
  }
}

function isAuthLifecycleRequest(url = '') {
  return ['/auth/login', '/auth/register', '/auth/refresh'].some((path) => url.includes(path))
}

function expireSession(expectedAccessToken?: string | null, expectedRefreshToken?: string | null) {
  const accessToken = getStoredToken()
  const refreshToken = getStoredRefreshToken()
  if (expectedAccessToken !== undefined && accessToken !== expectedAccessToken) return
  if (expectedRefreshToken !== undefined && refreshToken !== expectedRefreshToken) return
  if (!accessToken && !refreshToken) return
  clearStoredToken()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:expired', { detail: { accessToken } }))
  }
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
  const requestConfig = config as RetryableRequestConfig
  requestConfig._accessToken = token || undefined
  if (token) requestConfig.headers.Authorization = `Bearer ${token}`
  requestConfig.headers['X-Client-Platform'] = 'web'
  requestConfig.headers['X-Client-Version'] = CLIENT_VERSION
  requestConfig.headers['X-Client-Build'] = CLIENT_BUILD
  return config
})

http.interceptors.response.use(
  (response) => {
    const payload = response.data as unknown
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
      && (originalRequest._accessToken || null) === getStoredToken()

    if (canRefresh) {
      originalRequest._retry = true
      try {
        const token = await refreshAccessToken()
        if (originalRequest.skipAuthRefreshReplay) return Promise.reject(toApiError(error))
        originalRequest.headers.Authorization = `Bearer ${token}`
        if (originalRequest.url?.includes('/auth/logout')) {
          originalRequest.headers['X-Refresh-Token'] = getStoredRefreshToken() || ''
        }
        return http(originalRequest)
      } catch {
        // refreshAccessToken owns session expiration for all waiting requests.
      }
    } else if (error.response?.status === 401 && !isAuthLifecycleRequest(originalRequest?.url)) {
      expireSession(originalRequest?._accessToken ?? null)
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
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return Promise.reject(new Error('Refresh token is missing'))
  if (activeRefresh?.refreshToken === refreshToken) return activeRefresh.promise
  const accessToken = getStoredToken()

  const request = axios.post<ApiResponse<LoginResult>>(
    apiUrl('/auth/refresh'),
    { refreshToken },
    { timeout: 30000 },
  ).then((response) => {
    const payload = response.data
    if (!isApiPayload(payload) || !('code' in payload) || !isSuccessCode(payload.code) || !('data' in payload) || !payload.data) {
      throw new Error(readErrorMessage(payload, 'Token refresh failed'))
    }
    const result = payload.data as LoginResult
    if (!result.accessToken || !result.refreshToken) throw new Error('Token refresh response is incomplete')
    if (getStoredToken() !== accessToken || getStoredRefreshToken() !== refreshToken) {
      throw new Error('Token refresh was invalidated by a newer session')
    }
    setStoredToken(result.accessToken, result.refreshToken)
    tokenRefreshListeners.forEach((listener) => listener(result))
    return result.accessToken
  }).catch((error) => {
    expireSession(accessToken, refreshToken)
    throw error
  }).finally(() => {
    if (activeRefresh?.promise === request) activeRefresh = null
  })
  activeRefresh = { refreshToken, promise: request }

  return request
}
