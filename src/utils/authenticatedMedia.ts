import { getStoredToken, getStoredRefreshToken, refreshAccessToken } from '@/services/http'

const PRIVATE_MEDIA_PATHS = ['/api/media/ai/', '/api/assets/']
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

function isTrustedMediaOrigin(origin: string) {
  const trustedOrigins = new Set([window.location.origin])
  try {
    trustedOrigins.add(new URL(API_BASE_URL, window.location.origin).origin)
  } catch {
    // A malformed API base URL is handled by the regular API client.
  }
  return trustedOrigins.has(origin)
}

export function isAuthenticatedMediaUrl(url: string) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false
  try {
    const parsed = new URL(url, window.location.origin)
    return isTrustedMediaOrigin(parsed.origin)
      && PRIVATE_MEDIA_PATHS.some((path) => parsed.pathname.startsWith(path))
  } catch {
    return false
  }
}

export async function fetchMediaBlob(url: string, signal?: AbortSignal) {
  const isPrivate = isAuthenticatedMediaUrl(url)
  let token = isPrivate ? getStoredToken() : null
  if (isPrivate && !token) throw new Error('Authentication is required to load this image')
  let response = await requestMedia(url, token, signal)
  if (isPrivate && response.status === 401 && getStoredRefreshToken()) {
    token = await refreshAccessToken()
    response = await requestMedia(url, token, signal)
  }
  if (!response.ok) throw new Error(`Image request failed with status ${response.status}`)
  return response.blob()
}

function requestMedia(url: string, token: string | null, signal?: AbortSignal) {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { headers, signal })
}

export async function resolveMediaUrl(url: string, signal?: AbortSignal) {
  if (!isAuthenticatedMediaUrl(url)) return { url, objectUrl: '' }
  const blob = await fetchMediaBlob(url, signal)
  const objectUrl = URL.createObjectURL(blob)
  return { url: objectUrl, objectUrl }
}
