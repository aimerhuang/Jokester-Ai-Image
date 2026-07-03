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

type ImageUrlSource = Pick<ImageRecord, 'url' | 'imageUrl' | 'image_url' | 'fileUrl' | 'file_url' | 'dataUrl' | 'resultUrls' | 'result_urls' | 'imageUrls' | 'image_urls' | 'urls' | 'images' | 'base64' | 'mimeType'>
type ImageKeySource = Pick<ImageRecord, 'id' | 'taskId' | 'url' | 'imageUrl' | 'image_url' | 'fileUrl' | 'file_url' | 'dataUrl' | 'resultUrls' | 'result_urls' | 'imageUrls' | 'image_urls' | 'urls' | 'images'>

type ImageUrlObject = { url?: unknown; imageUrl?: unknown; image_url?: unknown; fileUrl?: unknown; file_url?: unknown }

function normalizeImageUrl(url: string) {
  const text = url.trim().replace(/\\/g, '/')
  if (!text) return ''
  if (/^(https?:)?\/\//i.test(text) || text.startsWith('data:') || text.startsWith('blob:')) return text
  if (text.startsWith('/')) return text
  if (text.startsWith('./')) return normalizeImageUrl(text.slice(2))
  if (text.startsWith('ai-images/') || text.startsWith('nano-banana2-images/') || text.startsWith('avatar/')) return `/${text}`
  return `/ai-images/${text}`
}

function readImageUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(readImageUrls)
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text) as unknown
      const parsedUrls = readImageUrls(parsed)
      if (parsedUrls.length) return parsedUrls
    } catch {
      return [normalizeImageUrl(text)]
    }
    return [normalizeImageUrl(text)]
  }
  if (value && typeof value === 'object') {
    const item = value as ImageUrlObject
    return [item.url, item.imageUrl, item.image_url, item.fileUrl, item.file_url].flatMap(readImageUrls)
  }
  return []
}

function uniqueUrls(urls: string[]) {
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))]
}

function readFirstResultUrl(value: unknown) {
  return readImageUrls(value)[0] || ''
}

export function getImageUrls(record?: ImageUrlSource | null) {
  if (!record) return []
  const urls = [
    record.url,
    record.imageUrl,
    record.image_url,
    record.fileUrl,
    record.file_url,
    record.dataUrl,
    record.resultUrls,
    record.result_urls,
    record.imageUrls,
    record.image_urls,
    record.urls,
    record.images,
    record.base64 ? `data:${record.mimeType || 'image/png'};base64,${record.base64}` : '',
  ].flatMap(readImageUrls)
  return uniqueUrls(urls)
}

export function getFirstImageResultUrl(record?: Pick<ImageRecord, 'resultUrls' | 'result_urls'> | null) {
  if (!record) return ''
  return readFirstResultUrl(record.resultUrls) || readFirstResultUrl(record.result_urls)
}

export function getImageUrl(record?: ImageUrlSource | null) {
  return getImageUrls(record)[0] || ''
}

export function getImageKey(record?: ImageKeySource | null) {
  if (!record) return ''
  const firstUrl = getImageUrl(record)
  const id = record.id || record.taskId
  if (id && firstUrl) return `${id}:${firstUrl}`
  return String(id || firstUrl || '')
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
