import { computed, reactive, toValue, type MaybeRefOrGetter } from 'vue'
import { getMaxImageCount, getPricingOptions } from '@/services/aiImages'
import { useAppStore } from '@/stores/app'
import { getLocalizedImageOptionLabel, sortImageResolutionCodes, useImageOptionsStore } from '@/stores/imageOptions'
import { isPricingEnvelope, normalizePricingOption, unwrapPricingResult } from '@/utils/imagePricing'
import type { CanvasGenerateNodeData } from '@/types/canvas'
import type { AiImagePricingOption, CreateImageTaskRequest, ImageParameterOption, ImageSizeMode } from '@/types/image'

interface PricingEntry {
  status: 'loading' | 'ready' | 'failed'
  items: AiImagePricingOption[]
}

// Shared across canvas nodes: pricing is fetched once per model release, matching the playground contract.
const pricingCache = reactive(new Map<string, PricingEntry>())
const AUTO = 'auto'

export function normalizeOptionKey(value: string | number | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function pricingKey(model: ImageParameterOption) {
  return `${model.value}@${model.sizeContractVersion === 'size-mode-v1' ? model.catalogVersion || '' : 'legacy'}`
}

export async function ensureModelPricing(model: ImageParameterOption | undefined, force = false) {
  if (!model) return
  const key = pricingKey(model)
  const existing = pricingCache.get(key)
  if (existing && !force && existing.status !== 'failed') return
  pricingCache.set(key, { status: 'loading', items: [] })
  try {
    const usesV1 = model.sizeContractVersion === 'size-mode-v1'
    const catalogVersion = model.catalogVersion || ''
    if (usesV1 && !catalogVersion) throw new Error('The selected model has no catalog version')
    const result = await getPricingOptions(usesV1 ? model.value : undefined, usesV1 ? catalogVersion : undefined)
    let rawItems: unknown[]
    if (usesV1) {
      if (!isPricingEnvelope(result)
        || normalizeOptionKey(result.modelCode) !== normalizeOptionKey(model.value)
        || result.catalogVersion !== catalogVersion) {
        throw new Error('Image pricing catalog does not match the selected model')
      }
      rawItems = result.items
    } else {
      rawItems = unwrapPricingResult(result)
    }
    pricingCache.set(key, {
      status: 'ready',
      items: rawItems
        .map((item, index) => normalizePricingOption(item, index))
        .filter((item): item is AiImagePricingOption => Boolean(item)),
    })
  } catch {
    pricingCache.set(key, { status: 'failed', items: [] })
  }
}

export function useCanvasGenerationOptions(source: MaybeRefOrGetter<CanvasGenerateNodeData | null | undefined>) {
  const app = useAppStore()
  const optionsStore = useImageOptionsStore()

  const data = computed(() => toValue(source) || null)
  const models = computed(() => optionsStore.options.models || [])
  const selectedModel = computed(() => models.value.find((item) => item.value === data.value?.modelCode))
  const usesSizeModeV1 = computed(() => selectedModel.value?.sizeContractVersion === 'size-mode-v1')
  const supportsQuality = computed(() => selectedModel.value?.capabilities?.supportsQuality !== false)
  const pricing = computed(() => selectedModel.value ? pricingCache.get(pricingKey(selectedModel.value)) : undefined)
  const pricingReady = computed(() => pricing.value?.status === 'ready')
  const pricingFailed = computed(() => pricing.value?.status === 'failed')
  const modelPrices = computed(() => {
    const modelKey = normalizeOptionKey(data.value?.modelCode)
    return (pricing.value?.items || []).filter((item) => [item.modelCode, item.modelName]
      .some((value) => normalizeOptionKey(value) === modelKey) && Number.isFinite(item.points) && item.points > 0)
  })
  const sizeModes = computed<ImageSizeMode[]>(() => {
    if (!usesSizeModeV1.value) return []
    const declared = [...new Set((selectedModel.value?.capabilities?.sizeModes || [])
      .filter((item): item is ImageSizeMode => item === 'explicit' || item === 'auto'))]
    return declared.filter((mode) => modelPrices.value.some((item) => item.sizeMode === mode))
  })
  const isAuto = computed(() => usesSizeModeV1.value && data.value?.sizeMode === 'auto')

  const resolutionOptions = computed(() => {
    const declared = selectedModel.value?.resolutions || []
    const priced = new Set(modelPrices.value
      .filter((item) => !usesSizeModeV1.value || item.sizeMode === 'explicit')
      .map((item) => normalizeOptionKey(item.resolutionCode || item.resolutionName)))
    return toOptions('resolutions', sortImageResolutionCodes(declared.filter((code) => priced.has(normalizeOptionKey(code)))), optionsStore.options.resolutions)
  })
  const qualityOptions = computed(() => {
    if (!supportsQuality.value) return []
    const declared = selectedModel.value?.qualities || optionsStore.options.qualities.map((item) => item.value)
    const codes = declared.filter((code) => modelPrices.value.some((item) => {
      if (normalizeOptionKey(item.qualityCode || item.qualityName) !== normalizeOptionKey(code)) return false
      if (usesSizeModeV1.value) {
        if (item.sizeMode !== (data.value?.sizeMode || 'explicit')) return false
        if (data.value?.sizeMode === AUTO) return true
      }
      return normalizeOptionKey(item.resolutionCode || item.resolutionName) === normalizeOptionKey(data.value?.resolutionCode)
    }))
    return toOptions('qualities', codes, optionsStore.options.qualities)
  })
  // Aspect ratio options include an "auto" tile only when the model actually supports it:
  // size-mode-v1 models expose auto as a size mode, legacy Gemini models as an aspect code.
  const aspectOptions = computed(() => {
    const declared = (selectedModel.value?.aspectRatios || []).filter((code) => normalizeOptionKey(code) !== AUTO)
    const options = toOptions('aspectRatios', declared, optionsStore.options.aspectRatios)
    const legacyAuto = !usesSizeModeV1.value
      && (selectedModel.value?.aspectRatios || []).some((code) => normalizeOptionKey(code) === AUTO)
    const v1Auto = usesSizeModeV1.value && sizeModes.value.includes('auto')
    if (legacyAuto || v1Auto) options.unshift({ value: AUTO, label: getLocalizedImageOptionLabel('aspectRatios', AUTO, app.locale) })
    if (usesSizeModeV1.value && !sizeModes.value.includes('explicit')) return options.filter((item) => item.value === AUTO)
    return options
  })
  const selectedAspect = computed(() => isAuto.value ? AUTO : data.value?.aspectRatioCode || '')
  const maxImageCount = computed(() => {
    const counts = selectedModel.value?.capabilities?.supportedImageCounts?.filter((count) => Number.isInteger(count) && count > 0) || []
    const capabilityMax = counts.length ? Math.max(...counts) : getMaxImageCount(data.value?.modelCode || undefined)
    return Math.max(1, Math.min(getMaxImageCount(data.value?.modelCode || undefined), capabilityMax))
  })
  const selectedPrice = computed(() => modelPrices.value.find((item) => {
    if (supportsQuality.value && ![item.qualityCode, item.qualityName]
      .some((value) => normalizeOptionKey(value) === normalizeOptionKey(data.value?.qualityCode))) return false
    if (usesSizeModeV1.value) {
      if (item.sizeMode !== data.value?.sizeMode) return false
      if (data.value?.sizeMode === AUTO) return true
    }
    return [item.resolutionCode, item.resolutionName]
      .some((value) => normalizeOptionKey(value) === normalizeOptionKey(data.value?.resolutionCode))
  }))
  const imageCount = computed(() => Math.min(Math.max(1, data.value?.imageCount || 1), maxImageCount.value))
  const estimatedPoints = computed(() => selectedPrice.value ? selectedPrice.value.points * imageCount.value : null)
  const parametersValid = computed(() => {
    const value = data.value
    if (!value || !selectedModel.value) return false
    if (supportsQuality.value && !value.qualityCode) return false
    if (usesSizeModeV1.value) {
      if (!value.sizeMode || !sizeModes.value.includes(value.sizeMode)) return false
      if (value.sizeMode === AUTO) return true
    }
    return Boolean(value.resolutionCode && value.aspectRatioCode)
  })
  const summaryText = computed(() => {
    const parts: string[] = []
    if (supportsQuality.value && data.value?.qualityCode) parts.push(shortLabel(data.value.qualityCode))
    if (!isAuto.value && data.value?.resolutionCode) parts.push(data.value.resolutionCode.toUpperCase())
    parts.push(selectedAspect.value === AUTO ? getLocalizedImageOptionLabel('aspectRatios', AUTO, app.locale) : selectedAspect.value || '—')
    return parts.join(' · ')
  })

  // Returns the minimal patch that moves the node parameters onto the current model capabilities.
  function reconcile(): Partial<CanvasGenerateNodeData> | null {
    const value = data.value
    if (!value) return null
    const patch: Partial<CanvasGenerateNodeData> = {}
    if (!selectedModel.value) {
      const first = models.value[0]
      if (first && first.value !== value.modelCode) patch.modelCode = first.value
      return Object.keys(patch).length ? patch : null
    }
    if (selectedModel.value.catalogVersion && value.catalogVersion !== selectedModel.value.catalogVersion) {
      patch.catalogVersion = selectedModel.value.catalogVersion
    }
    if (!pricingReady.value) return Object.keys(patch).length ? patch : null
    if (usesSizeModeV1.value) {
      if (!value.sizeMode || !sizeModes.value.includes(value.sizeMode)) {
        const defaultMode = selectedModel.value.capabilities?.defaultSizeMode
        patch.sizeMode = sizeModes.value.includes('explicit') ? 'explicit' : defaultMode && sizeModes.value.includes(defaultMode) ? defaultMode : sizeModes.value[0] || null
      }
    } else if (value.sizeMode) {
      patch.sizeMode = null
    }
    const effectiveMode = patch.sizeMode !== undefined ? patch.sizeMode : value.sizeMode
    const explicit = !usesSizeModeV1.value || effectiveMode === 'explicit'
    if (explicit) {
      if (!resolutionOptions.value.some((item) => item.value === value.resolutionCode)) {
        patch.resolutionCode = resolutionOptions.value.find((item) => normalizeOptionKey(item.value) === '2k')?.value
          || resolutionOptions.value[0]?.value || null
      }
      const explicitAspects = aspectOptions.value.filter((item) => usesSizeModeV1.value ? item.value !== AUTO : true)
      if (!explicitAspects.some((item) => item.value === value.aspectRatioCode)) {
        patch.aspectRatioCode = explicitAspects.find((item) => item.value === '16:9')?.value
          || explicitAspects.find((item) => item.value === '1:1')?.value
          || explicitAspects[0]?.value || null
      }
    }
    if (supportsQuality.value) {
      if (qualityOptions.value.length && !qualityOptions.value.some((item) => item.value === value.qualityCode)) {
        patch.qualityCode = qualityOptions.value[0]?.value || null
      }
    } else if (value.qualityCode) {
      patch.qualityCode = null
    }
    if ((value.imageCount || 1) > maxImageCount.value) patch.imageCount = maxImageCount.value
    return Object.keys(patch).length ? patch : null
  }

  // Applying an aspect tile switches size mode for size-mode-v1 models.
  function aspectPatch(code: string): Partial<CanvasGenerateNodeData> {
    if (usesSizeModeV1.value) {
      return code === AUTO ? { sizeMode: 'auto' } : { sizeMode: 'explicit', aspectRatioCode: code }
    }
    return { aspectRatioCode: code }
  }

  function buildRequest(prompt: string, referenceAssetIds: string[]): Omit<CreateImageTaskRequest, 'idempotencyKey'> | null {
    const value = data.value
    const model = selectedModel.value
    if (!value || !model || !parametersValid.value) return null
    const base = {
      prompt,
      modelCode: model.value,
      modelName: model.value,
      imageCount: imageCount.value,
      referenceImageUrls: [],
      referenceAssetIds,
      ...(supportsQuality.value && value.qualityCode ? { qualityCode: value.qualityCode } : {}),
    }
    if (usesSizeModeV1.value) {
      return value.sizeMode === AUTO
        ? { ...base, sizeMode: 'auto', catalogVersion: model.catalogVersion || '' }
        : {
            ...base,
            sizeMode: 'explicit',
            catalogVersion: model.catalogVersion || '',
            resolutionCode: value.resolutionCode,
            aspectRatioCode: value.aspectRatioCode,
          }
    }
    return { ...base, resolutionCode: value.resolutionCode, aspectRatioCode: value.aspectRatioCode }
  }

  function toOptions(category: 'resolutions' | 'qualities' | 'aspectRatios', codes: string[], catalog: ImageParameterOption[]) {
    return [...new Set(codes)].map((code) => {
      const item = catalog.find((entry) => normalizeOptionKey(entry.value) === normalizeOptionKey(code)) || { label: code, value: code }
      return { value: item.value, label: category === 'aspectRatios' ? item.value : getLocalizedImageOptionLabel(category, item, app.locale) }
    })
  }

  function shortLabel(code: string) {
    const key = normalizeOptionKey(code)
    if (key === 'med' || key === 'medium') return 'Medium'
    return code.charAt(0).toUpperCase() + code.slice(1)
  }

  return {
    models,
    selectedModel,
    usesSizeModeV1,
    supportsQuality,
    pricingReady,
    pricingFailed,
    sizeModes,
    isAuto,
    resolutionOptions,
    qualityOptions,
    aspectOptions,
    selectedAspect,
    maxImageCount,
    imageCount,
    estimatedPoints,
    parametersValid,
    summaryText,
    reconcile,
    aspectPatch,
    buildRequest,
    ensurePricing: (force = false) => ensureModelPricing(selectedModel.value, force),
  }
}
