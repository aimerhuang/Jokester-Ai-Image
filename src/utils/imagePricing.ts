import type { AiImagePricingEnvelope, AiImagePricingOption } from '@/types/image'

function readString(item: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return fallback
}

function readNumber(item: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

export function unwrapPricingResult(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (!result || typeof result !== 'object') return []
  const payload = result as Record<string, unknown>
  const candidates = [payload.data, payload.items, payload.list, payload.records, payload.rows, payload.pricingOptions, payload.options]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

export function normalizePricingOption(item: unknown, index: number): AiImagePricingOption | null {
  if (!item || typeof item !== 'object') return null
  const source = item as Record<string, unknown>
  const modelCode = readString(source, ['modelCode', 'modelName', 'model', '模型编码', '模型名称'])
  const modelName = readString(source, ['modelName', 'modelDisplayName', 'modelLabel', 'model', '模型名称', '模型'], modelCode)
  const resolutionCode = readString(source, ['resolutionCode', 'resolution', 'size', '分辨率编码', '分辨率'])
  const resolutionName = readString(source, ['resolutionName', 'resolutionDisplayName', 'resolutionLabel', 'resolution', 'size', '分辨率名称', '分辨率'], resolutionCode)
  const qualityCode = readString(source, ['qualityCode', 'quality', 'qualityLevel', '画质编码', '画质'])
  const qualityName = readString(source, ['qualityName', 'qualityDisplayName', 'qualityLabel', 'quality', 'qualityLevel', '画质名称', '画质'], qualityCode)
  const rawSizeMode = readString(source, ['sizeMode'])
  const normalizedSizeMode = rawSizeMode === 'auto' || rawSizeMode === 'explicit' ? rawSizeMode : undefined

  return {
    modelCode: modelCode || modelName,
    modelName: modelName || modelCode,
    sizeMode: normalizedSizeMode,
    resolutionCode: normalizedSizeMode === 'auto' ? null : resolutionCode,
    resolutionName,
    qualityCode,
    qualityName,
    points: readNumber(source, ['points', 'pointCost', 'costPoints', 'credits', 'creditCost', 'point', '积分', '消耗积分'], 0),
    priceAmount: readNumber(source, ['priceAmount', 'price', 'amount', 'referencePrice', '参考价格', '价格'], 0),
    priceMinorUnits: readNumber(source, ['priceMinorUnits'], 0),
    currency: readString(source, ['currency', 'currencyCode', '币种'], 'CNY'),
    sort: readNumber(source, ['sort', 'sortOrder', 'order', '排序'], index),
  }
}

export function isPricingEnvelope(value: unknown): value is AiImagePricingEnvelope {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AiImagePricingEnvelope>
  return typeof candidate.modelCode === 'string'
    && typeof candidate.catalogVersion === 'string'
    && Array.isArray(candidate.items)
}
