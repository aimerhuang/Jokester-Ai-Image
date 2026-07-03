<template>
  <div>
    <div class="playground-grid">
      <section class="page-card prompt-panel">
        <el-form label-position="top">
          <el-form-item :label="app.t('playground.prompt')">
            <div class="prompt-input-wrap">
              <el-input v-model="form.prompt" type="textarea" :rows="7" class="prompt-textarea" :placeholder="app.t('playground.promptPlaceholder')" />
              <button v-if="form.prompt" class="prompt-clear" type="button" aria-label="Clear prompt" @click="form.prompt = ''">
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </el-form-item>
          <el-form-item :label="app.t('playground.referenceImages')">
            <ReferenceUploader :initial-urls="form.referenceImageUrls" @change="form.referenceImageUrls = $event" @uploading-change="referenceUploading = $event" />
          </el-form-item>
          <el-form-item :label="app.t('playground.model')">
            <el-select v-model="modelCode" :loading="optionsStore.loading">
              <el-option v-for="item in modelOptions" :key="item.value" :label="item.name || item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <div class="parameter-grid">
            <el-form-item :label="app.t('playground.resolution')"><el-segmented v-model="form.resolutionCode" :options="resolutionOptions" /></el-form-item>
            <el-form-item v-if="!isNanoModel" :label="app.t('playground.quality')"><el-segmented v-model="form.qualityCode" :options="qualityOptions" /></el-form-item>
            <div class="inline-parameter-row">
              <el-form-item :label="app.t('playground.aspectRatio')">
                <el-select v-model="form.aspectRatioCode">
                  <template #prefix>
                    <span class="aspect-icon" :style="getAspectIconStyle(form.aspectRatioCode)" aria-hidden="true"></span>
                  </template>
                  <el-option v-for="item in aspectOptions" :key="item.value" :label="item.label" :value="item.value">
                    <span class="aspect-option">
                      <span class="aspect-icon" :style="getAspectIconStyle(item.value)" aria-hidden="true"></span>
                      <span>{{ item.label }}</span>
                    </span>
                  </el-option>
                </el-select>
              </el-form-item>
              <el-form-item :label="app.t('playground.batchSize')">
                <el-select v-model="batchSize">
                  <el-option v-for="item in batchSizeOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
            </div>
          </div>
          <div class="generate-row">
            <span class="credit-hint">{{ app.t('profile.currentCredits') }}: {{ credits.summary.balance }}</span>
            <span class="cost-hint">{{ app.t('pricing.points') }}: {{ estimatedPointsText }}</span>
            <el-button type="primary" class="soft-button generate" size="large" :loading="busy" :disabled="referenceUploading" @click="submit">{{ app.t('common.generate') }}</el-button>
          </div>
        </el-form>
      </section>
      <ResultPreview :title="app.t('playground.previewTitle')" :loading-text="app.t('common.generating')" :empty-title="app.t('playground.emptyTitle')" :empty-description="app.t('playground.emptyDescription')" :image-url="imageUrl" :loading="busy">
        <el-button :disabled="!imageUrl" @click="downloadCurrent">{{ app.t('common.download') }}</el-button>
        <el-button type="primary" plain :disabled="!form.prompt" @click="copyPrompt">{{ app.t('playground.copyPrompt') }}</el-button>
      </ResultPreview>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import ReferenceUploader from '@/components/images/ReferenceUploader.vue'
import ResultPreview from '@/components/images/ResultPreview.vue'
import { useImageTaskPolling } from '@/composables/useImageTaskPolling'
import { generateImage, getMaxImageCount, getPricingOptions, isNanoBananaModel } from '@/services/aiImages'
import { downloadImage, getImageUrl, takeReuseConfig } from '@/utils/imageActions'
import { useAppStore } from '@/stores/app'
import { useCreditsStore } from '@/stores/credits'
import { fallbackImageParameters, getLocalizedImageOptionLabel, useImageOptionsStore } from '@/stores/imageOptions'
import type { ApiError } from '@/types/api'
import type { CreateImageTaskRequest, GeneratedImageResult, AiImagePricingOption } from '@/types/image'

const app = useAppStore()
const route = useRoute()
const credits = useCreditsStore()
const optionsStore = useImageOptionsStore()
const submitting = ref(false)
const referenceUploading = ref(false)
const result = ref<GeneratedImageResult | null>(null)
const pricingOptions = ref<AiImagePricingOption[]>([])
const modelCode = ref('')
const batchSize = ref(1)
const TASK_TIMEOUT_PER_IMAGE_MS = 3 * 60 * 1000
const MAX_TASK_TIMEOUT_MS = 10 * 60 * 1000
const form = reactive({ prompt: '', resolutionCode: '', qualityCode: '', aspectRatioCode: '', referenceImageUrls: [] as string[] })
const { polling, handleInitialResult, resumePending } = useImageTaskPolling({
  onUpdate: (task) => {
    result.value = task
  },
  onSuccess: () => {
    credits.fetchSummary().catch(() => undefined)
  },
  onFailure: () => {
    credits.fetchSummary().catch(() => undefined)
  },
  onExpired: () => {
    ElMessage.warning(app.t('playground.generationExpired'))
    credits.fetchSummary().catch(() => undefined)
  },
})

const modelOptions = computed(() => optionsStore.options.models || [])
const resolutionOptions = computed(() => (isNanoModel.value ? fallbackImageParameters.resolutions : optionsStore.options.resolutions)?.map((item) => ({ label: getLocalizedImageOptionLabel('resolutions', item, app.locale), value: item.value })) || [])
const qualityOptions = computed(() => optionsStore.options.qualities?.map((item) => ({ label: getLocalizedImageOptionLabel('qualities', item, app.locale), value: item.value })) || [])
const aspectOptions = computed(() => optionsStore.options.aspectRatios?.map((item) => ({ label: getLocalizedImageOptionLabel('aspectRatios', item, app.locale), value: item.value })) || [])
const imageUrl = computed(() => getImageUrl(result.value))
const busy = computed(() => submitting.value || polling.value)
const isNanoModel = computed(() => isNanoBananaModel(modelCode.value))
const maxImageCount = computed(() => getMaxImageCount(modelCode.value))
const batchSizeOptions = computed(() => Array.from({ length: maxImageCount.value }, (_, index) => {
  const value = index + 1
  const unit = app.locale === 'zh-CN' ? '张' : value === 1 ? 'image' : 'images'
  return { label: app.locale === 'zh-CN' ? `${value}${unit}` : `${value} ${unit}`, value }
}))
const selectedPricingOption = computed(() => pricingOptions.value.find((item) => {
  const selectedModel = normalizeKey(modelCode.value)
  const selectedResolution = normalizeKey(form.resolutionCode)
  const selectedQuality = normalizeKey(form.qualityCode)
  const modelMatched = [item.modelCode, item.modelName].some((value) => normalizeKey(value) === selectedModel)
  const resolutionMatched = [item.resolutionCode, item.resolutionName].some((value) => normalizeKey(value) === selectedResolution)
  const qualityMatched = isNanoModel.value || [item.qualityCode, item.qualityName].some((value) => normalizeKey(value) === selectedQuality)
  return modelMatched && resolutionMatched && qualityMatched
}))
const estimatedPoints = computed(() => selectedPricingOption.value ? selectedPricingOption.value.points * batchSize.value : 0)
const estimatedPointsText = computed(() => estimatedPoints.value ? estimatedPoints.value : '—')

watch(maxImageCount, (max) => {
  if (batchSize.value > max) batchSize.value = max
})

watch(modelOptions, (items) => {
  if (!modelCode.value && items[0]) modelCode.value = items[0].value
}, { immediate: true })
watch(resolutionOptions, (items) => {
  if (!form.resolutionCode && items[0]) form.resolutionCode = items[0].value
}, { immediate: true })
watch(qualityOptions, (items) => {
  if (!form.qualityCode && items[0]) form.qualityCode = items[0].value
}, { immediate: true })
watch(aspectOptions, (items) => {
  if (!form.aspectRatioCode && items[0]) form.aspectRatioCode = items[0].value
}, { immediate: true })

onMounted(() => {
  void optionsStore.fetchOptions().catch(() => undefined)
  void credits.fetchSummary().catch(() => undefined)
  void loadPricingOptions()
  applyReuseConfig()
  resumePending()
})

function normalizeKey(value: string | number | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function getAspectIconStyle(value: string | undefined) {
  const normalized = String(value || '').trim().toLowerCase()
  const match = normalized.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  if (!match) return { width: '16px', height: '16px' }

  const widthRatio = Number(match[1])
  const heightRatio = Number(match[2])
  if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || widthRatio <= 0 || heightRatio <= 0) {
    return { width: '16px', height: '16px' }
  }

  const maxSize = 18
  if (widthRatio >= heightRatio) {
    return {
      width: `${maxSize}px`,
      height: `${Math.max(8, Math.round(maxSize * heightRatio / widthRatio))}px`,
    }
  }

  return {
    width: `${Math.max(8, Math.round(maxSize * widthRatio / heightRatio))}px`,
    height: `${maxSize}px`,
  }
}

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

function unwrapPricingResult(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (!result || typeof result !== 'object') return []
  const payload = result as Record<string, unknown>
  const candidates = [payload.data, payload.items, payload.list, payload.records, payload.rows, payload.pricingOptions, payload.options]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

function normalizePricingOption(item: unknown, index: number): AiImagePricingOption | null {
  if (!item || typeof item !== 'object') return null
  const source = item as Record<string, unknown>
  const modelCode = readString(source, ['modelCode', 'modelName', 'model', '模型编码', '模型名称'])
  const modelName = readString(source, ['modelName', 'modelDisplayName', 'modelLabel', 'model', '模型名称', '模型'], modelCode)
  const resolutionCode = readString(source, ['resolutionCode', 'resolution', 'size', '分辨率编码', '分辨率'])
  const resolutionName = readString(source, ['resolutionName', 'resolutionDisplayName', 'resolutionLabel', 'resolution', 'size', '分辨率名称', '分辨率'], resolutionCode)
  const qualityCode = readString(source, ['qualityCode', 'quality', 'qualityLevel', '画质编码', '画质'])
  const qualityName = readString(source, ['qualityName', 'qualityDisplayName', 'qualityLabel', 'quality', 'qualityLevel', '画质名称', '画质'], qualityCode)

  return {
    modelCode: modelCode || modelName,
    modelName: modelName || modelCode,
    resolutionCode,
    resolutionName,
    qualityCode,
    qualityName,
    points: readNumber(source, ['points', 'pointCost', 'costPoints', 'credits', 'creditCost', 'point', '积分', '消耗积分'], 0),
    priceAmount: readNumber(source, ['priceAmount', 'price', 'amount', 'referencePrice', '参考价格', '价格'], 0),
    currency: readString(source, ['currency', 'currencyCode', '币种'], 'CNY'),
    sort: readNumber(source, ['sort', 'sortOrder', 'order', '排序'], index),
  }
}

async function loadPricingOptions() {
  const result = await getPricingOptions()
  pricingOptions.value = unwrapPricingResult(result)
    .map((item, index) => normalizePricingOption(item, index))
    .filter((item): item is AiImagePricingOption => Boolean(item))
}

function applyReuseConfig() {
  const config = takeReuseConfig()
  const prompt = String(route.query.prompt || config?.prompt || '')
  const reference = route.query.reference
  const referenceImageUrls = Array.isArray(reference) ? reference.filter(Boolean).map(String) : reference ? [String(reference)] : config?.referenceImageUrls || []

  if (prompt) form.prompt = prompt
  if (config?.modelName) modelCode.value = config.modelName
  if (config?.resolutionCode) form.resolutionCode = config.resolutionCode
  if (config?.qualityCode) form.qualityCode = config.qualityCode
  if (config?.aspectRatioCode) form.aspectRatioCode = config.aspectRatioCode
  if (referenceImageUrls.length) {
    form.referenceImageUrls = [...new Set([...form.referenceImageUrls, ...referenceImageUrls])]
    ElMessage.success(app.t('imageDetail.referenceApplied'))
  }
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(form.prompt)
    ElMessage.success(app.t('imageDetail.copySuccess'))
  } catch {
    ElMessage.warning(form.prompt)
  }
}

function downloadCurrent() {
  downloadImage(imageUrl.value, `image-${globalThis.crypto?.randomUUID?.() || 'generated'}.png`)
}

function getTaskTimeoutMs(imageCount: number) {
  return Math.min(imageCount * TASK_TIMEOUT_PER_IMAGE_MS, MAX_TASK_TIMEOUT_MS)
}

async function submit() {
  if (referenceUploading.value) return ElMessage.warning('Reference images are still uploading')
  if (!form.prompt.trim()) return ElMessage.warning(app.t('playground.prompt'))
  if (!modelCode.value || !form.resolutionCode || !form.aspectRatioCode || (!isNanoModel.value && !form.qualityCode)) return ElMessage.warning('Please select all image parameters')
  if (form.referenceImageUrls.length > 6) return ElMessage.warning('Max 6 images')

  submitting.value = true
  try {
    const imageCount = Math.min(batchSize.value, maxImageCount.value)
    const request: CreateImageTaskRequest = {
      ...form,
      qualityCode: isNanoModel.value ? '' : form.qualityCode,
      modelName: modelCode.value,
      imageCount,
    }
    const response = await generateImage(request)
    handleInitialResult(response, {
      expiresAt: Date.now() + getTaskTimeoutMs(imageCount),
      imageCount,
    })
    void credits.fetchSummary().catch(() => undefined)
  } catch (error) {
    ElMessage.error((error as ApiError).message || app.t('common.retry'))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.playground-grid { display: grid; grid-template-columns: minmax(0, 500px) minmax(0, 1fr); gap: 24px; align-items: start; }
.prompt-panel { min-width: 0; padding: 24px; }
.prompt-input-wrap { position: relative; width: 100%; }
.prompt-clear {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease;
}
.prompt-clear:hover { color: var(--el-color-danger); background: rgba(245, 108, 108, 0.1); }
:deep(.prompt-textarea .el-textarea__inner) { padding-right: 44px; }
.parameter-grid { display: grid; gap: 8px; }
.inline-parameter-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: start; }
.inline-parameter-row :deep(.el-form-item) { margin-bottom: 0; }
.inline-parameter-row :deep(.el-select) { width: 100%; }
.aspect-option { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.aspect-icon {
  display: inline-block;
  flex: 0 0 auto;
  box-sizing: border-box;
  border: 1.5px solid var(--el-color-primary);
  border-radius: 3px;
  background: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  vertical-align: middle;
}
:deep(.el-select__prefix) { display: inline-flex; align-items: center; }
:deep(.el-select__prefix .aspect-icon) { margin-left: 2px; }
:deep(.el-segmented) { width: 100%; max-width: 100%; }
:deep(.el-segmented__group) { width: 100%; }
:deep(.el-segmented__item) { min-width: 0; flex: 1 1 0; }
:deep(.el-segmented__item-label) { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.2; }
.generate { width: 100%; height: 48px; }
.generate-row { display: grid; gap: 8px; }
.credit-hint, .cost-hint { color: var(--color-text-muted); font-size: 13px; font-weight: 600; }
.cost-hint { color: var(--color-primary); }
@media (max-width: 1100px) { .playground-grid { grid-template-columns: 1fr; } }
@media (max-width: 520px) { .inline-parameter-row { grid-template-columns: 1fr; } }
</style>
