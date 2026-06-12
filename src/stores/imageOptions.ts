import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getImageModels, getImageParameters } from '@/services/aiImages'
import type { Locale } from '@/types/app'
import type { ImageParameterApiOption, ImageParameterOption, ImageParameters, ImageParametersResponse } from '@/types/image'

type ImageOptionCategory = 'resolutions' | 'qualities' | 'aspectRatios'

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
  },
  aspectRatios: {
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
  return option?.value || option?.code || option?.providerValue || option?.name || option?.label || ''
}

function normalizeOptions(options: ImageParameterApiOption[] | undefined): ImageParameterOption[] | undefined {
  return [...(options || [])]
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((item) => ({ ...item, label: item.label || item.name || getOptionValue(item), value: getOptionValue(item) }))
}

function normalizeModelOptions(options: ImageParameterApiOption[] | undefined): ImageParameterOption[] | undefined {
  return [...(options || [])]
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((item) => ({
      ...item,
      label: item.name || item.label || getOptionValue(item),
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
  aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'].map((value) => ({ label: value, value })),
}

function normalizeImageParameters(parameters: ImageParametersResponse): ImageParameters {
  return {
    ...fallbackImageParameters,
    ...parameters,
    models: normalizeOptions(parameters.models) || fallbackImageParameters.models,
    resolutions: normalizeOptions(parameters.resolutions) || fallbackImageParameters.resolutions,
    qualities: normalizeOptions(parameters.qualities) || fallbackImageParameters.qualities,
    aspectRatios: normalizeOptions(parameters.aspectRatios) || fallbackImageParameters.aspectRatios,
  }
}

export const useImageOptionsStore = defineStore('imageOptions', () => {
  const options = ref<ImageParameters>(fallbackImageParameters)
  const loading = ref(false)

  async function fetchOptions() {
    loading.value = true
    try {
      const [parameters, models] = await Promise.all([getImageParameters(), getImageModels()])
      options.value = {
        ...normalizeImageParameters(parameters),
        models: normalizeModelOptions(models) || fallbackImageParameters.models,
      }
    } finally {
      loading.value = false
    }
  }

  return { options, loading, fetchOptions }
})
