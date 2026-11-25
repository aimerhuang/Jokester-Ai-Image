import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getImageModels, getImageParameters, getPricingOptions } from '@/services/aiImages'
import { useAuthStore } from '@/stores/auth'
import { getStoredToken } from '@/services/http'
import type { Locale } from '@/types/app'
import type { ImageParameterApiOption, ImageParameterOption, ImageParameters, ImageParametersResponse } from '@/types/image'

type ImageOptionCategory = 'resolutions' | 'qualities' | 'aspectRatios'

const preferredResolutionOrder = new Map([
  ['1k', 0],
  ['2k', 1],
  ['4k', 2],
])

export function sortImageResolutionCodes(codes: string[]) {
  return [...new Set(codes)]
    .map((value, index) => ({ value, index, order: preferredResolutionOrder.get(value.trim().toLowerCase()) }))
    .sort((left, right) => {
      if (left.order === undefined && right.order === undefined) return left.index - right.index
      if (left.order === undefined) return 1
      if (right.order === undefined) return -1
      return left.order - right.order || left.index - right.index
    })
    .map((item) => item.value)
}

const localizedLabels: Record<ImageOptionCategory, Record<string, Record<Locale, string>>> = {
  resolutions: {
    '1k': { 'zh-CN': '1K(快速预览)', 'en-US': '1K(Quick Preview)' },
    '2k': { 'zh-CN': '2K(推荐尺寸)', 'en-US': '2K(Recommended Size)' },
    '4k': { 'zh-CN': '4K(超清画质)', 'en-US': '4K(Ultra HD Quality)' },
  },
  qualities: {
    low: { 'zh-CN': 'Low(快速/基础)', 'en-US': 'Low(Fast/Basic)' },
    med: { 'zh-CN': 'Medium(标准)', 'en-US': 'Medium(Standard)' },
    medium: { 'zh-CN': 'Medium(标准)', 'en-US': 'Medium(Standard)' },
    high: { 'zh-CN': 'High(高精细)', 'en-US': 'High(High Detail)' },
    xhigh: { 'zh-CN': 'Xhigh(超高精细)', 'en-US': 'Xhigh(Extra Detail)' },
    max: { 'zh-CN': 'Max(极致)', 'en-US': 'Max(Maximum Detail)' },
  },
  aspectRatios: {
    auto: { 'zh-CN': '自动', 'en-US': 'Auto' },
    '1:1': { 'zh-CN': '1:1(方形)', 'en-US': '1:1(Square)' },
    '16:9': { 'zh-CN': '16:9(横屏)', 'en-US': '16:9(Landscape)' },
    '9:16': { 'zh-CN': '9:16(竖屏)', 'en-US': '9:16(Portrait)' },
    '4:3': { 'zh-CN': '4:3(标准)', 'en-US': '4:3(Standard)' },
    '3:4': { 'zh-CN': '3:4(纵向)', 'en-US': '3:4(Vertical)' },
    '3:2': { 'zh-CN': '3:2(胶片)', 'en-US': '3:2(Film)' },
    '2:3': { 'zh-CN': '2:3(经典)', 'en-US': '2:3(Classic)' },
    '21:9': { 'zh-CN': '21:9(宽屏)', 'en-US': '21:9(Widescreen)' },
  },
}

function getOptionValue(option: ImageParameterApiOption | ImageParameterOption | string | undefined) {
  if (typeof option === 'string') return option
  if (!option) return ''
  if ('value' in option && option.value) return option.value
  return option.code || option.providerValue || option.name || ('label' in option ? option.label : '') || ''
}

function normalizeOptions(options: ImageParameterApiOption[] | undefined): ImageParameterOption[] {
  return [...(options || [])]
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((item) => ({ ...item, label: item.name || getOptionValue(item), value: getOptionValue(item) }))
}

function normalizeModelOptions(options: ImageParameterApiOption[] | undefined): ImageParameterOption[] {
  return [...(options || [])]
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((item) => ({
      ...item,
      label: item.name || getOptionValue(item),
      value: item.code || getOptionValue(item),
    }))
}

export function getLocalizedImageOptionLabel(category: ImageOptionCategory, option: ImageParameterOption | string | undefined, locale: Locale) {
  const rawValue = getOptionValue(option)
  const key = rawValue.toLowerCase()
  return localizedLabels[category][key]?.[locale] || (typeof option === 'string' ? option : option?.name || option?.label) || rawValue
}

export const fallbackImageParameters: ImageParameters = {
  models: [],
  resolutions: ['1k', '2k', '4k'].map((value) => ({ label: value.toUpperCase(), value })),
  qualities: ['low', 'med', 'high'].map((value) => ({ label: value, value })),
  aspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'].map((value) => ({ label: value, value })),
  pointPrices: [],
}

function normalizeResolutionOptions(options: ImageParameterApiOption[] | undefined): ImageParameterOption[] {
  const normalized = normalizeOptions(options)
  const lookup = new Map(normalized.map((item) => [item.value, item]))
  return sortImageResolutionCodes(normalized.map((item) => item.value))
    .map((value) => lookup.get(value))
    .filter((item): item is ImageParameterOption => Boolean(item))
}

function normalizeImageParameters(parameters: ImageParametersResponse): ImageParameters {
  const resolutions = normalizeResolutionOptions(parameters.resolutions)
  const qualities = normalizeOptions(parameters.qualities)
  const aspectRatios = normalizeOptions(parameters.aspectRatios)

  return {
    ...fallbackImageParameters,
    ...parameters,
    models: fallbackImageParameters.models,
    resolutions: resolutions.length ? resolutions : fallbackImageParameters.resolutions,
    qualities: qualities.length ? qualities : fallbackImageParameters.qualities,
    aspectRatios: aspectRatios.length ? aspectRatios : fallbackImageParameters.aspectRatios,
    pointPrices: parameters.pointPrices || [],
  }
}

export const useImageOptionsStore = defineStore('imageOptions', () => {
  const options = ref<ImageParameters>(fallbackImageParameters)
  const loading = ref(false)
  const modelCapabilitiesReady = ref(false)

  const auth = useAuthStore()
  let pending: { token: string | null; promise: Promise<void> } | undefined
  let lastQuoteRevision: number | undefined

  function fetchOptions() {
    const token = getStoredToken()
    if (pending?.token === token) return pending.promise
    const promise = loadOptions(token).finally(() => {
      if (pending?.promise === promise) pending = undefined
    })
    pending = { token, promise }
    return promise
  }

  async function loadOptions(token: string | null) {
    loading.value = true
    modelCapabilitiesReady.value = false
    try {
      const [parametersResult, modelsResult] = await Promise.allSettled([getImageParameters(), getImageModels()])
      if (token !== getStoredToken() || token !== auth.token) throw new Error('Session changed')
      const normalizedParameters = parametersResult.status === 'fulfilled'
        ? normalizeImageParameters(parametersResult.value)
        : options.value
      const modelOptions = modelsResult.status === 'fulfilled'
        ? normalizeModelOptions(modelsResult.value)
        : options.value.models
      options.value = {
        ...normalizedParameters,
        models: modelOptions,
      }
      if (modelsResult.status === 'rejected') throw modelsResult.reason
      modelCapabilitiesReady.value = modelOptions.length > 0
    } finally {
      if (token === getStoredToken()) loading.value = false
    }
  }

  async function fetchModelPricing(model: ImageParameterOption) {
    const token = getStoredToken()
    const usesV1 = model.sizeContractVersion === 'size-mode-v1'
    const request = () => getPricingOptions(usesV1 ? model.value : undefined, usesV1 ? model.catalogVersion : undefined)
    let quote = await request()
    const revision = Array.isArray(quote) ? undefined : quote.pricingRevision
    const changed = [options.value.pricingRevision, lastQuoteRevision].some(known => known != null && known !== revision)
    if (revision != null && changed) {
      await fetchOptions()
      quote = await request()
      if (!Array.isArray(quote) && options.value.pricingRevision != null && quote.pricingRevision !== options.value.pricingRevision) {
        throw new Error('Image pricing changed during refresh')
      }
    }
    if (token !== getStoredToken() || token !== auth.token) throw new Error('Session changed')
    lastQuoteRevision = Array.isArray(quote) ? undefined : quote.pricingRevision
    return quote
  }

  return { options, loading, modelCapabilitiesReady, fetchOptions, fetchModelPricing }
})
