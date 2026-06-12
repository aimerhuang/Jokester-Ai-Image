import type { ImageRecord } from '@/types/image'

export const FAVORITES_STORAGE_KEY = 'jokester:image:favorites'
export const REUSE_CONFIG_STORAGE_KEY = 'jokester:image:reuse-config'

export interface ReuseImageConfig {
  prompt?: string
  modelName?: string
  resolutionCode?: string
  qualityCode?: string
  aspectRatioCode?: string
  referenceImageUrls?: string[]
}

type ImageUrlSource = Pick<ImageRecord, 'url' | 'dataUrl' | 'resultUrls' | 'result_urls' | 'base64' | 'mimeType'>
type ImageKeySource = Pick<ImageRecord, 'id' | 'taskId' | 'url' | 'dataUrl' | 'resultUrls' | 'result_urls'>

function readFirstResultUrl(value: unknown) {
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string' && Boolean(item.trim()))?.trim() || ''
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return ''
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) return readFirstResultUrl(parsed)
    } catch {
      return text
    }
    return text
  }
  return ''
}

export function getFirstImageResultUrl(record?: Pick<ImageRecord, 'resultUrls' | 'result_urls'> | null) {
  if (!record) return ''
  return readFirstResultUrl(record.resultUrls) || readFirstResultUrl(record.result_urls)
}

export function getImageUrl(record?: ImageUrlSource | null) {
  if (!record) return ''
  return record.url || record.dataUrl || getFirstImageResultUrl(record) || (record.base64 ? `data:${record.mimeType || 'image/png'};base64,${record.base64}` : '')
}

export function getImageKey(record?: ImageKeySource | null) {
  if (!record) return ''
  return String(record.id || record.taskId || record.url || record.dataUrl || getFirstImageResultUrl(record) || '')
}

export function truncatePrompt(prompt = '', maxLength = 20) {
  const value = prompt.trim()
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

export function formatImageDate(createdAt?: string) {
  if (!createdAt) return '-'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return createdAt
  return date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function readFavoriteKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]') as string[])
  } catch {
    return new Set<string>()
  }
}

export function writeFavoriteKeys(keys: Set<string>) {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...keys]))
}

export function isRecordFavorite(record: ImageRecord, favorites = readFavoriteKeys()) {
  const key = getImageKey(record)
  return Boolean(record.favorite || record.isFavorite || (key && favorites.has(key)))
}

export function toggleRecordFavorite(record: ImageRecord) {
  const key = getImageKey(record)
  if (!key) return false
  const keys = readFavoriteKeys()
  const next = !keys.has(key)
  if (next) keys.add(key)
  else keys.delete(key)
  writeFavoriteKeys(keys)
  return next
}

export async function downloadImage(url: string, filename = 'generated-image.png') {
  if (!url) return

  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    triggerDownload(objectUrl, filename)
    URL.revokeObjectURL(objectUrl)
  } catch {
    triggerDownload(url, filename)
  }
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.target = '_blank'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function saveReuseConfig(config: ReuseImageConfig) {
  localStorage.setItem(REUSE_CONFIG_STORAGE_KEY, JSON.stringify(config))
}

export function takeReuseConfig() {
  const raw = localStorage.getItem(REUSE_CONFIG_STORAGE_KEY)
  if (!raw) return null
  try {
    const config = JSON.parse(raw) as ReuseImageConfig
    localStorage.removeItem(REUSE_CONFIG_STORAGE_KEY)
    return config
  } catch {
    return null
  }
}
