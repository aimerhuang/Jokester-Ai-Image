<template>
  <div>
    <div class="playground-grid">
      <section class="page-card prompt-panel">
        <el-form label-position="top">
          <el-form-item :label="app.t('playground.prompt')">
            <div class="prompt-input-wrap">
              <el-input v-model="form.prompt" type="textarea" :rows="7" class="prompt-textarea" :placeholder="app.t('playground.promptPlaceholder')" />
              <button v-if="form.prompt" class="prompt-clear" type="button" :aria-label="app.t('playground.clearPrompt')" @click="form.prompt = ''">
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </el-form-item>
          <el-form-item :label="app.t('playground.referenceImages')">
            <ReferenceUploader
              :initial-urls="form.referenceImageUrls"
              :initial-references="referenceDrafts"
              @change="form.referenceImageUrls = $event"
              @asset-ids-change="form.referenceAssetIds = $event"
              @references-change="handleReferencesChange"
              @uploading-change="referenceUploading = $event"
            />
          </el-form-item>
          <el-form-item :label="app.t('playground.model')">
            <ModelPicker v-model="modelCode" :models="modelOptions" :loading="optionsStore.loading" show-gif-badge @locked="offerMembership" />
          </el-form-item>
          <el-form-item v-if="gifCapability" :label="app.t('gif.format')">
            <el-segmented v-model="outputFormat" class="format-toggle" :options="[{ label: 'PNG', value: 'png' }, { label: 'GIF', value: 'gif' }]" />
          </el-form-item>
          <div v-if="selectedModel?.access?.available === false" class="insufficient-notice" role="status">
            <span>{{ app.t('vipPricing.locked') }}</span>
            <el-button link type="primary" @click="offerMembership()">{{ app.t('vipPricing.buy') }}</el-button>
          </div>
          <p v-else-if="selectedModel?.access?.basis === 'super_admin'">{{ app.t('vipPricing.admin') }}</p>
          <div class="parameter-grid">
            <el-form-item v-if="usesSizeModeV1 && sizeModeOptions.length > 1" :label="app.t('playground.sizeMode')">
              <el-segmented v-model="sizeMode" :options="sizeModeOptions" />
            </el-form-item>
            <div v-if="isGif" class="inline-parameter-row" :class="{ 'single-parameter': !supportsQuality }">
              <el-form-item :label="app.t('playground.resolution')"><el-select disabled :model-value="''" :placeholder="app.t('gif.defaultResolution')" /></el-form-item>
              <el-form-item v-if="supportsQuality" :label="app.t('playground.quality')">
                <el-select v-model="form.qualityCode" data-testid="gif-quality-select">
                  <el-option v-for="item in qualityOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
            </div>
            <template v-else>
              <el-form-item v-if="showsExplicitSizeFields" :label="app.t('playground.resolution')"><el-segmented v-model="form.resolutionCode" :options="resolutionOptions" /></el-form-item>
              <el-form-item v-if="supportsQuality" :label="app.t('playground.quality')"><el-segmented v-model="form.qualityCode" :options="qualityOptions" /></el-form-item>
            </template>
            <div v-if="isGif && gifCapability" class="inline-parameter-row">
              <el-form-item :label="app.t('gif.frames')"><el-select v-model="frameCount"><el-option v-for="n in gifCapability.frameCounts" :key="n" :label="frameOptionLabel(n)" :value="n" /></el-select></el-form-item>
              <el-form-item :label="app.t('gif.duration')"><el-select v-model="frameDurationMs"><el-option v-for="ms in gifCapability.frameDurationsMs" :key="ms" :label="durationOptionLabel(ms)" :value="ms" /></el-select></el-form-item>
            </div>
            <div class="inline-parameter-row" :class="{ 'single-parameter': !showsExplicitSizeFields }">
              <el-form-item v-if="showsExplicitSizeFields" :label="app.t('playground.aspectRatio')">
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
            <div class="cost-summary">
              <span class="credit-hint">{{ app.t('playground.availableBalance') }}: {{ balanceText }}</span>
              <template v-if="isGif">
                <span class="cost-hint">{{ app.t('playground.estimatedCost') }}: {{ estimatedPointsText }}</span>
                <el-button link type="primary" @click="billingOpen = true">{{ app.t('gif.rule') }}</el-button>
              </template>
              <span v-else class="cost-hint">{{ app.t('playground.estimatedCost') }}: {{ estimatedPointsText }} <VipPriceSummary v-if="selectedPricingOption?.pricingTier === 'vip'" :list="selectedPricingOption.points" :paid="selectedPricingOption.effectivePoints" :count="batchSize" /></span>
            </div>
            <div v-if="hasInsufficientPoints" class="insufficient-notice" role="alert">
              <span>{{ app.t('playground.insufficientPoints') }}</span>
              <el-button type="primary" link :disabled="referenceUploading" @click="openRecharge">
                <el-icon><Coin /></el-icon>
                <span>{{ app.t('pricing.getMoreCredits') }}</span>
              </el-button>
            </div>
            <div v-if="generationDataError" class="generation-data-notice" role="alert">
              <span>{{ generationDataMessage }}</span>
              <el-button type="primary" link :loading="dataReloading" @click="retryGenerationData">{{ app.t('common.retry') }}</el-button>
            </div>
            <span class="deduction-rule">{{ app.t('playground.deductionRule') }}</span>
            <span v-if="rateLimitRemainingSeconds" class="rate-limit-hint">{{ rateLimitText }}</span>
            <el-button type="primary" class="soft-button generate" size="large" :loading="busy" :disabled="selectedModel?.access?.available === false || !hasValidPrompt || referenceUploading || generationBlocked || generationPrerequisitesUnavailable || hasInsufficientPoints || rateLimitRemainingSeconds > 0" @click="submit">{{ rateLimitRemainingSeconds ? rateLimitText : app.t('common.generate') }}</el-button>
          </div>
        </el-form>
      </section>
      <GifBillingDialog v-if="gifCapability" v-model="billingOpen" :capability="gifCapability" :quality-code="form.qualityCode" :frame-count="frameCount" :reference-count="form.referenceImageUrls.length + form.referenceAssetIds.length" />
      <ResultPreview
        :title="app.t('playground.previewTitle')"
        :loading-text="app.t('common.generating')"
        :failed-text="app.t('playground.taskFailed')"
        :empty-title="app.t('playground.emptyTitle')"
        :empty-description="app.t('playground.emptyDescription')"
        :image-urls="resultImageUrls"
        :items="previewItems"
        :expected-count="activeImageCount"
        :progress="result?.progress"
        :selected-index="selectedResultIndex"
        :loading="busy"
        @update:selected-index="selectedResultIndex = $event"
      >
        <el-button :disabled="!imageUrl" @click="downloadCurrent">{{ app.t('common.download') }}</el-button>
        <el-button type="primary" plain :disabled="!form.prompt" @click="copyPrompt">{{ app.t('playground.copyPrompt') }}</el-button>
      </ResultPreview>
    </div>
  </div>
</template>

<script setup lang="ts">
import VipPriceSummary from '@/components/pricing/VipPriceSummary.vue'
import GifBillingDialog from '@/components/images/GifBillingDialog.vue'
import { calculateReservePoints } from '@/utils/gifBilling'
import ModelPicker from '@/components/images/ModelPicker.vue'
import { pickUsableModelCode } from '@/utils/modelPresentation'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Coin, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ReferenceUploader from '@/components/images/ReferenceUploader.vue'
import ResultPreview from '@/components/images/ResultPreview.vue'
import { normalizeTaskStatus, useImageTaskPolling, type ImageTaskSnapshot } from '@/composables/useImageTaskPolling'
import { generateImage, getImageRecords, getMaxImageCount, isNanoBananaModel } from '@/services/aiImages'
import { downloadImage, getImageUrl, getImageUrls, takeReuseConfig } from '@/utils/imageActions'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'
import { fallbackImageParameters, getLocalizedImageOptionLabel, sortImageResolutionCodes, useImageOptionsStore } from '@/stores/imageOptions'
import { usePlaygroundDraftStore } from '@/stores/playgroundDraft'
import { getStoredToken } from '@/services/http'
import { offerVipMonthlyPass } from '@/utils/vipGuide'
import { startImageTaskHistoryRecovery } from '@/utils/imageTaskRecovery'
import { isPricingEnvelope, normalizePricingOption, unwrapPricingResult } from '@/utils/imagePricing'
import type { PlaygroundReferenceDraft } from '@/stores/playgroundDraft'
import type { ApiError } from '@/types/api'
import type { CreateImageTaskRequest, GeneratedImageBatchItem, GeneratedImageResult, AiImagePricingOption, ImageParameterOption, ImageSizeMode } from '@/types/image'

const app = useAppStore()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const credits = useCreditsStore()
const optionsStore = useImageOptionsStore()
const draftStore = usePlaygroundDraftStore()
const draftUserId = auth.user?.id ?? null
const restoredDraft = draftStore.getDraft(draftUserId)
const submitting = ref(false)
const referenceUploading = ref(false)
const referenceDrafts = ref<PlaygroundReferenceDraft[]>(restoredDraft.references)
const result = ref<GeneratedImageResult | null>(null)
const taskResults = ref<Array<ImageTaskSnapshot | null>>([])
const activeImageCount = ref(0)
const pricingOptions = ref<AiImagePricingOption[]>([])
const pricingCatalogVersion = ref('')
const modelCode = ref(restoredDraft.modelCode)
const outputFormat = ref(restoredDraft.outputFormat)
const frameCount = ref(restoredDraft.frameCount)
const frameDurationMs = ref(restoredDraft.frameDurationMs)
const billingOpen = ref(false)
const sizeMode = ref<ImageSizeMode | null>(restoredDraft.sizeMode)
const lastExplicitResolutionCode = ref(restoredDraft.lastExplicitResolutionCode || restoredDraft.resolutionCode)
const lastExplicitAspectRatioCode = ref(restoredDraft.lastExplicitAspectRatioCode || (restoredDraft.aspectRatioCode === 'auto' ? '' : restoredDraft.aspectRatioCode))
const sourcePromptId = ref<number | undefined>(restoredDraft.sourcePromptId)
const sourcePromptText = ref(restoredDraft.sourcePromptId ? restoredDraft.prompt : '')
const batchSize = ref(Math.max(1, restoredDraft.imageCount || 1))
const selectedResultIndex = ref(0)
const rateLimitRemainingSeconds = ref(0)
const balanceReady = ref(false)
const balanceLoadFailed = ref(false)
const pricingReady = ref(false)
const pricingLoadFailed = ref(false)
const optionsLoadFailed = ref(false)
const dataReloading = ref(false)
const generationBlocked = ref(false)
const TASK_TIMEOUT_PER_IMAGE_MS = 5 * 60 * 1000
const MAX_TASK_TIMEOUT_MS = 10 * 60 * 1000
const SUBMISSION_STORAGE_KEY = 'pendingAiImageSubmission'
const SUBMISSION_MAX_AGE_MS = 30 * 60 * 1000
interface TaskRecoveryBaseline {
  captured: boolean
  taskIds: string[]
}
const form = reactive({
  prompt: restoredDraft.prompt,
  resolutionCode: restoredDraft.resolutionCode,
  qualityCode: restoredDraft.qualityCode,
  aspectRatioCode: restoredDraft.aspectRatioCode,
  referenceImageUrls: restoredDraft.references.filter((item) => !item.assetId).map((item) => item.url),
  referenceAssetIds: restoredDraft.references.map((item) => item.assetId).filter(Boolean),
})
let rateLimitTimer: ReturnType<typeof setInterval> | null = null
let rateLimitUntil = 0
let viewActive = true
let pricingRequestId = 0
let terminalFailureNoticeShown = false
const { polling, handleInitialResult, resumePending } = useImageTaskPolling({
  onUpdate: (task, index, total) => {
    const nextTasks = total > 1 ? [...taskResults.value] : [task]
    while (nextTasks.length < total) nextTasks.push(null)
    nextTasks[index] = task
    taskResults.value = nextTasks
    result.value = task as GeneratedImageResult
    activeImageCount.value = Math.max(activeImageCount.value, total)
  },
  onSuccess: () => {
    void refreshCreditData()
  },
  onFailure: () => {
    if (!terminalFailureNoticeShown) ElMessage.warning(app.t('playground.failureSettlementNotice'))
    terminalFailureNoticeShown = true
    void refreshCreditData()
  },
  onExpired: () => {
    if (!terminalFailureNoticeShown) {
      ElMessage.warning(app.t('playground.generationExpired'))
      ElMessage.info(app.t('playground.failureSettlementNotice'))
    }
    terminalFailureNoticeShown = true
    void refreshCreditData()
  },
  onUnavailable: () => {
    if (!terminalFailureNoticeShown) ElMessage.warning(app.t('playground.taskUnavailable'))
    terminalFailureNoticeShown = true
    void refreshCreditData()
  },
  onError: (error) => {
    ElMessage.error(withRequestId(app.t('playground.taskStatusUnavailable'), error.requestId))
  },
})

const modelOptions = computed(() => optionsStore.options.models || [])
const selectedModel = computed(() => modelOptions.value.find((item) => item.value === modelCode.value))
const usesSizeModeV1 = computed(() => selectedModel.value?.sizeContractVersion === 'size-mode-v1')
const gifCapability = computed(() => usesSizeModeV1.value ? null : selectedModel.value?.capabilities?.gif)
const isGif = computed(() => outputFormat.value === 'gif' && Boolean(gifCapability.value))
const supportsQuality = computed(() => selectedModel.value?.capabilities?.supportsQuality !== false)
const isNanoModel = computed(() => isGeminiImageModel(selectedModel.value, modelCode.value))
const availablePricingOptions = computed<AiImagePricingOption[]>(() => pricingOptions.value)
const modelPricingOptions = computed(() => {
  const selectedModelKey = normalizeKey(modelCode.value)
  return availablePricingOptions.value.filter((item) => [item.modelCode, item.modelName]
    .some((value) => normalizeKey(value) === selectedModelKey))
})
const declaredSizeModes = computed<ImageSizeMode[]>(() => {
  if (!usesSizeModeV1.value) return []
  return [...new Set((selectedModel.value?.capabilities?.sizeModes || [])
    .filter((item): item is ImageSizeMode => item === 'explicit' || item === 'auto'))]
})
const selectableSizeModes = computed(() => {
  if (!pricingReady.value) return declaredSizeModes.value
  return declaredSizeModes.value.filter((mode) => modelPricingOptions.value.some((item) => item.sizeMode === mode && item.points > 0))
})
const sizeModeOptions = computed(() => selectableSizeModes.value.map((value) => ({
  value,
  label: app.t(value === 'auto' ? 'playground.sizeModeAuto' : 'playground.sizeModeExplicit'),
})))
const showsExplicitSizeFields = computed(() => !usesSizeModeV1.value || sizeMode.value === 'explicit')
const pricedResolutionCodes = computed(() => {
  return [...new Set(modelPricingOptions.value
    .filter((item) => !usesSizeModeV1.value || item.sizeMode === 'explicit')
    .map((item) => item.resolutionCode || item.resolutionName || '')
    .filter(Boolean))]
})
const supportedResolutionCodes = computed(() => {
  const modelCodes = selectedModel.value?.resolutions
    ?? fallbackImageParameters.resolutions.map((item) => item.value)
  const safeModelCodes = isNanoModel.value
    ? modelCodes
    : modelCodes.filter((value) => fallbackImageParameters.resolutions
      .some((item) => normalizeKey(item.value) === normalizeKey(value)))
  if (!pricingReady.value) return safeModelCodes

  const pricedKeys = new Set(pricedResolutionCodes.value.map((value) => normalizeKey(value)))
  return safeModelCodes.filter((value) => pricedKeys.has(normalizeKey(value)))
})
const resolutionOptions = computed(() => parameterOptionsForCodes(
  'resolutions',
  sortImageResolutionCodes(supportedResolutionCodes.value),
  optionsStore.options.resolutions,
))
const qualityOptions = computed(() => {
  const declaredCodes = selectedModel.value?.qualities ?? optionsStore.options.qualities.map((item) => item.value)
  if (isGif.value && gifCapability.value) {
    const { perFramePoints } = gifCapability.value.reserve
    const codes = declaredCodes.filter(code => Object.hasOwn(perFramePoints, code))
    return parameterOptionsForCodes('qualities', codes, optionsStore.options.qualities)
  }
  const priceConstrainedCodes = pricingReady.value
    ? declaredCodes.filter((code) => modelPricingOptions.value.some((item) => {
        if (normalizeKey(item.qualityCode || item.qualityName) !== normalizeKey(code)) return false
        if (usesSizeModeV1.value) {
          if (item.sizeMode !== sizeMode.value) return false
          return sizeMode.value === 'auto' || normalizeKey(item.resolutionCode || item.resolutionName) === normalizeKey(form.resolutionCode)
        }
        return normalizeKey(item.resolutionCode || item.resolutionName) === normalizeKey(form.resolutionCode)
      }))
    : declaredCodes
  return parameterOptionsForCodes('qualities', priceConstrainedCodes, optionsStore.options.qualities)
})
const aspectOptions = computed(() => {
  const supportedCodes = [...(selectedModel.value?.aspectRatios || [])]
  if (isGif.value) return parameterOptionsForCodes('aspectRatios', supportedCodes.filter(code => code !== 'auto'), optionsStore.options.aspectRatios)
  const catalogAutoCode = optionsStore.options.aspectRatios
    .find((item) => normalizeKey(item.value) === 'auto')?.value
  if (selectedModel.value
    && !usesSizeModeV1.value
    && selectedModel.value?.sizeContractVersion !== 'legacy-explicit-v1'
    && catalogAutoCode
    && !supportedCodes.some((code) => normalizeKey(code) === 'auto')) {
    supportedCodes.push(catalogAutoCode)
  }
  return parameterOptionsForCodes(
    'aspectRatios',
    supportedCodes,
    optionsStore.options.aspectRatios,
  )
})
const resultImageUrls = computed(() => taskResults.value.flatMap((task) => getImageUrls(task)).filter((url, index, urls) => urls.indexOf(url) === index))
const previewItems = computed<GeneratedImageBatchItem[]>(() => {
  const aggregate = taskResults.value.find((task) => task?.results?.length)
  if (aggregate?.results?.length) return aggregate.results

  if (taskResults.value.length > 1) {
    return Array.from({ length: Math.max(activeImageCount.value, taskResults.value.length) }, (_, index) => {
      const task = taskResults.value[index]
      const status = task ? normalizePreviewStatus(task) : 'processing'
      return {
        ordinal: index + 1,
        taskId: task?.taskId || task?.id || `pending-${index + 1}`,
        status,
        isDeleted: Boolean(task?.isDeleted),
        url: getImageUrl(task) || null,
      }
    })
  }

  if (resultImageUrls.value.length) return resultImageUrls.value.map((url, index) => ({
    ordinal: index + 1,
    taskId: result.value?.taskId || result.value?.id || `result-${index + 1}`,
    status: 'succeeded',
    isDeleted: false,
    url,
  }))

  const loneTask = taskResults.value[0]
  return loneTask ? [{
    ordinal: 1,
    taskId: loneTask.taskId || loneTask.id || 'result-1',
    status: normalizePreviewStatus(loneTask),
    isDeleted: Boolean(loneTask.isDeleted),
    url: null,
  }] : []
})
const imageUrl = computed(() => resultImageUrls.value[selectedResultIndex.value] || '')
const busy = computed(() => submitting.value || polling.value)
const hasValidPrompt = computed(() => Boolean(form.prompt.trim()))
const maxImageCount = computed(() => {
  const supportedCounts = selectedModel.value?.capabilities?.supportedImageCounts
    ?.filter((count) => Number.isInteger(count) && count > 0) || []
  const capabilityMax = supportedCounts.length ? Math.max(...supportedCounts) : getMaxImageCount(modelCode.value)
  return Math.min(getMaxImageCount(modelCode.value), capabilityMax)
})
const batchSizeOptions = computed(() => Array.from({ length: maxImageCount.value }, (_, index) => {
  const value = index + 1
  const unit = app.locale === 'zh-CN' ? '张' : value === 1 ? 'image' : 'images'
  return { label: app.locale === 'zh-CN' ? `${value}${unit}` : `${value} ${unit}`, value }
}))
const selectedPricingOption = computed(() => availablePricingOptions.value.find((item) => {
  if (!Number.isFinite(item.points) || item.points <= 0) return false
  const selectedModel = normalizeKey(modelCode.value)
  const selectedResolution = normalizeKey(form.resolutionCode)
  const selectedQuality = normalizeKey(form.qualityCode)
  const modelMatched = [item.modelCode, item.modelName].some((value) => normalizeKey(value) === selectedModel)
  const qualityMatched = !supportsQuality.value || [item.qualityCode, item.qualityName].some((value) => normalizeKey(value) === selectedQuality)
  if (!modelMatched || !qualityMatched) return false
  if (usesSizeModeV1.value) {
    if (item.sizeMode !== sizeMode.value) return false
    return sizeMode.value === 'auto'
      || [item.resolutionCode, item.resolutionName].some((value) => normalizeKey(value) === selectedResolution)
  }
  return [item.resolutionCode, item.resolutionName].some((value) => normalizeKey(value) === selectedResolution)
}))
const unitPoints = computed(() => {
  if (isGif.value && gifCapability.value) {
    if (!frameCount.value) return null
    return calculateReservePoints(gifCapability.value.reserve, form.qualityCode, frameCount.value, form.referenceImageUrls.length + form.referenceAssetIds.length)
  }
  return selectedPricingOption.value?.effectivePoints ?? selectedPricingOption.value?.points ?? null
})
const estimatedPoints = computed(() => unitPoints.value == null ? null : unitPoints.value * batchSize.value)
const quoteReady = computed(() => isGif.value ? unitPoints.value != null : pricingReady.value)
const estimatedPointsText = computed(() => {
  if (!quoteReady.value) return app.t('common.loading')
  return estimatedPoints.value ?? '—'
})
const balanceText = computed(() => {
  if (!balanceReady.value) return balanceLoadFailed.value ? app.t('playground.balanceUnavailable') : app.t('common.loading')
  return credits.summary.balance
})
const hasInsufficientPoints = computed(() => balanceReady.value
  && typeof estimatedPoints.value === 'number'
  && estimatedPoints.value > credits.summary.balance)
const validParameterSelection = computed(() => {
  if (!modelCode.value) return false
  if (isGif.value) return Boolean(gifCapability.value?.frameCounts.includes(frameCount.value ?? 0)
    && gifCapability.value.frameDurationsMs.includes(frameDurationMs.value ?? 0)
    && qualityOptions.value.some(item => item.value === form.qualityCode)
    && aspectOptions.value.some(item => item.value === form.aspectRatioCode))
  if (usesSizeModeV1.value) {
    if (!sizeMode.value || !selectableSizeModes.value.includes(sizeMode.value)) return false
    if (supportsQuality.value && !form.qualityCode) return false
    return sizeMode.value === 'auto' || Boolean(form.resolutionCode && form.aspectRatioCode)
  }
  return Boolean(form.resolutionCode && form.aspectRatioCode && (!supportsQuality.value || form.qualityCode))
})
const modelCapabilityUnavailable = computed(() => optionsStore.modelCapabilitiesReady
  && Boolean(selectedModel.value)
  && (usesSizeModeV1.value ? declaredSizeModes.value.length === 0 : aspectOptions.value.length === 0))
const pricingSelectionMissing = computed(() => !isGif.value && pricingReady.value
  && validParameterSelection.value
  && !selectedPricingOption.value)
const generationDataError = computed(() => balanceLoadFailed.value
  || (!isGif.value && pricingLoadFailed.value)
  || optionsLoadFailed.value
  || modelCapabilityUnavailable.value
  || pricingSelectionMissing.value)
const generationDataMessage = computed(() => balanceLoadFailed.value
  ? app.t('playground.balanceUnavailable')
  : optionsLoadFailed.value || modelCapabilityUnavailable.value
    ? app.t('playground.optionsUnavailable')
    : app.t('playground.pricingUnavailable'))
const generationPrerequisitesUnavailable = computed(() => !balanceReady.value
  || !quoteReady.value
  || optionsStore.loading
  || !optionsStore.modelCapabilitiesReady
  || optionsLoadFailed.value
  || !validParameterSelection.value
  || unitPoints.value == null)
const rateLimitText = computed(() => app.t('playground.rateLimitCountdown').replace('{seconds}', String(rateLimitRemainingSeconds.value)))

watch([selectedModel, gifCapability], ([model, gif]) => {
  if (!model) return // Restored drafts wait for the initial model catalog.
  if (!gif) {
    outputFormat.value = 'png'
    billingOpen.value = false
    return
  }
  if (!gif.frameCounts.includes(frameCount.value ?? 0)) frameCount.value = gif.defaultFrameCount
  if (!gif.frameDurationsMs.includes(frameDurationMs.value ?? 0)) frameDurationMs.value = gif.defaultFrameDurationMs
}, { immediate: true })

watch(maxImageCount, (max) => {
  if (batchSize.value > max) batchSize.value = max
})

watch(resultImageUrls, (urls) => {
  if (selectedResultIndex.value >= urls.length) selectedResultIndex.value = 0
})

watch(() => form.prompt, (prompt) => {
  if (sourcePromptId.value && prompt === sourcePromptText.value) {
    draftStore.clearManualPrompt(draftUserId)
    return
  }
  if (sourcePromptId.value) {
    sourcePromptId.value = undefined
    sourcePromptText.value = ''
  }
  draftStore.saveManualPrompt(draftUserId, prompt)
})

function offerMembership(code = modelCode.value) {
  return offerVipMonthlyPass(router, code, persistDraft)
}
watch(modelCode, () => { if (selectedModel.value?.access?.available === false) void offerMembership() })

watch(modelOptions, (items) => {
  if (!items.length) return
  const currentModelCode = modelCode.value
  const selected = items.find((item) => item.value === currentModelCode)
    || items.find((item) => [item.name, item.label].some((value) => normalizeKey(value) === normalizeKey(currentModelCode)))
  const nextModelCode = pickUsableModelCode(items, selected?.value)
  if (nextModelCode !== currentModelCode) modelCode.value = nextModelCode
}, { immediate: true })

watch(
  [() => selectedModel.value?.value, () => selectedModel.value?.sizeContractVersion, () => selectedModel.value?.catalogVersion, () => auth.user?.id, () => auth.token],
  () => {
    pricingReady.value = false
    pricingLoadFailed.value = false
    pricingOptions.value = []
    pricingCatalogVersion.value = ''
    reconcileModelSelection()
    void loadPricingOptions().catch(() => undefined)
  },
  { immediate: true },
)

watch([
  () => form.prompt,
  outputFormat,
  frameCount,
  frameDurationMs,
  () => form.resolutionCode,
  () => form.qualityCode,
  () => form.aspectRatioCode,
  sizeMode,
  lastExplicitResolutionCode,
  lastExplicitAspectRatioCode,
  pricingReady,
  () => optionsStore.modelCapabilitiesReady,
  modelCode,
  batchSize,
  sourcePromptId,
  referenceDrafts,
], persistDraft, { deep: true })
watch([resolutionOptions, isGif], ([items, gif]) => {
  if (gif || !showsExplicitSizeFields.value) return
  const preferred = lastExplicitResolutionCode.value || form.resolutionCode
  if (!items.some((item) => item.value === form.resolutionCode)) {
    form.resolutionCode = items.find((item) => item.value === preferred)?.value
      || getDefaultResolutionCode(items)
  }
}, { immediate: true })
watch(qualityOptions, (items) => {
  if (!items.some((item) => item.value === form.qualityCode)) form.qualityCode = items[0]?.value || ''
}, { immediate: true })
watch(aspectOptions, (items) => {
  if (!selectedModel.value || !showsExplicitSizeFields.value) return
  if (!items.some((item) => item.value === form.aspectRatioCode)) {
    const migratesLegacyGptAuto = draftStore.needsMigration
      && usesSizeModeV1.value
      && restoredDraft.aspectRatioCode === 'auto'
    form.aspectRatioCode = migratesLegacyGptAuto
      ? items.find((item) => item.value === '1:1')?.value || items[0]?.value || ''
      : items[0]?.value || ''
  }
}, { immediate: true })
watch(selectableSizeModes, reconcileModelSelection)
watch(sizeMode, (mode) => {
  if (mode !== 'explicit') return
  form.resolutionCode = resolutionOptions.value.find((item) => item.value === lastExplicitResolutionCode.value)?.value
    || getDefaultResolutionCode(resolutionOptions.value)
  form.aspectRatioCode = aspectOptions.value.find((item) => item.value === lastExplicitAspectRatioCode.value)?.value
    || aspectOptions.value[0]?.value
    || ''
})
watch(() => form.resolutionCode, (value) => {
  if (showsExplicitSizeFields.value && value) lastExplicitResolutionCode.value = value
})
watch(() => form.aspectRatioCode, (value) => {
  if (showsExplicitSizeFields.value && value && value !== 'auto') lastExplicitAspectRatioCode.value = value
})

onMounted(() => {
  window.addEventListener('focus', refreshModelCatalog)
  window.addEventListener('vip:changed', refreshModelCatalog)
  void loadImageOptions().catch(() => undefined)
  void loadBalance().catch(() => undefined)
  applyReuseConfig()
  const pending = resumePending()
  if (pending) activeImageCount.value = Math.max(pending.imageCount || 0, pending.taskIds.length)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshModelCatalog)
  window.removeEventListener('vip:changed', refreshModelCatalog)
  viewActive = false
  clearRateLimit()
})

onBeforeRouteLeave(() => {
  if (!auth.isAuthenticated) return true
  if (!referenceUploading.value) return true
  ElMessage.warning(app.t('playground.referenceUploading'))
  return false
})

function normalizeKey(value: string | number | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function getDefaultResolutionCode(options: Array<{ value: string }>) {
  return options.find((item) => normalizeKey(item.value) === '2k')?.value
    || options[0]?.value
    || ''
}

function normalizePreviewStatus(task: ImageTaskSnapshot): GeneratedImageBatchItem['status'] {
  const status = normalizeTaskStatus(task)
  if (status === 'queued' || status === 'processing' || status === 'succeeded' || status === 'failed') return status
  return status === 'partial' || status === 'cancelled' ? 'failed' : 'processing'
}

function reconcileModelSelection() {
  const model = selectedModel.value
  if (!model) {
    sizeMode.value = null
    return
  }
  if (!usesSizeModeV1.value) {
    sizeMode.value = null
    return
  }

  const modes = pricingReady.value ? selectableSizeModes.value : declaredSizeModes.value
  if (!modes.length) {
    sizeMode.value = null
    return
  }
  if (sizeMode.value && modes.includes(sizeMode.value)) return

  const restoredMode = restoredDraft.sizeMode
    || (restoredDraft.aspectRatioCode === 'auto' ? 'auto' : 'explicit')
  const defaultMode = model.capabilities?.defaultSizeMode
  sizeMode.value = modes.includes(restoredMode)
    ? restoredMode
    : defaultMode && modes.includes(defaultMode)
      ? defaultMode
      : modes[0]
}

function handleReferencesChange(references: PlaygroundReferenceDraft[]) {
  referenceDrafts.value = references.map((item) => ({ ...item }))
}

function persistDraft() {
  if (!selectedModel.value || !optionsStore.modelCapabilitiesReady) return
  if (usesSizeModeV1.value && (!pricingReady.value || !sizeMode.value || pricingCatalogVersion.value !== selectedModel.value.catalogVersion)) return
  if (!usesSizeModeV1.value && !aspectOptions.value.length) return
  draftStore.saveDraft(draftUserId, {
    outputFormat: outputFormat.value,
    frameCount: frameCount.value,
    frameDurationMs: frameDurationMs.value,
    prompt: form.prompt,
    modelCode: modelCode.value,
    resolutionCode: usesSizeModeV1.value && sizeMode.value === 'auto' ? '' : form.resolutionCode,
    qualityCode: form.qualityCode,
    aspectRatioCode: usesSizeModeV1.value && sizeMode.value === 'auto' ? '' : form.aspectRatioCode,
    sizeContractVersion: selectedModel.value.sizeContractVersion || null,
    sizeMode: usesSizeModeV1.value ? sizeMode.value : null,
    catalogVersion: selectedModel.value.catalogVersion || '',
    lastExplicitResolutionCode: lastExplicitResolutionCode.value,
    lastExplicitAspectRatioCode: lastExplicitAspectRatioCode.value,
    imageCount: batchSize.value,
    sourcePromptId: sourcePromptId.value,
    references: referenceDrafts.value,
  })
}

function openRecharge() {
  if (referenceUploading.value) {
    ElMessage.warning(app.t('playground.referenceUploading'))
    return
  }
  persistDraft()
  void router.push({ name: 'recharge' })
}

async function loadImageOptions() {
  optionsLoadFailed.value = false
  try {
    await optionsStore.fetchOptions()
    optionsLoadFailed.value = modelOptions.value.length === 0
  } catch (error) {
    optionsLoadFailed.value = true
    throw error
  }
}

async function loadBalance() {
  balanceLoadFailed.value = false
  try {
    await credits.fetchSummary()
    balanceReady.value = true
  } catch (error) {
    balanceReady.value = false
    balanceLoadFailed.value = true
    throw error
  }
}

async function retryGenerationData() {
  if (dataReloading.value) return
  dataReloading.value = true
  try {
    const [optionsResult] = await Promise.allSettled([loadImageOptions(), loadBalance()])
    if (optionsResult.status === 'fulfilled') await loadPricingOptions().catch(() => undefined)
  } finally {
    dataReloading.value = false
  }
}

function refreshCreditData() {
  return Promise.allSettled([credits.fetchSummary(), credits.fetchRecords()])
}

async function captureRecoveryBaseline(): Promise<TaskRecoveryBaseline> {
  try {
    const result = await getImageRecords({ pageIndex: 1, pageSize: 100 }, { timeout: 2500 })
    return {
      captured: true,
      taskIds: result.items.map((item) => String(item.taskId || item.id)).filter(Boolean),
    }
  } catch {
    return { captured: false, taskIds: [] }
  }
}

function isGeminiImageModel(model: ImageParameterOption | undefined, fallbackCode: string) {
  if (model?.capabilities?.supportsQuality === false) return true

  const providerKeys = [model?.providerCode, model?.provider]
    .map((value) => normalizeKey(value))
  if (providerKeys.some((value) => value === 'google' || value.includes('gemini'))) return true

  return [fallbackCode, model?.value, model?.name, model?.label]
    .some((value) => isNanoBananaModel(value))
}

function parameterOptionsForCodes(
  category: 'resolutions' | 'qualities' | 'aspectRatios',
  codes: string[],
  catalog: ImageParameterOption[],
) {
  const source = [...new Set(codes)].map((code) => catalog.find((item) => normalizeKey(item.value) === normalizeKey(code)) || { label: code, value: code })
  return source.map((item) => ({
    label: getLocalizedImageOptionLabel(category, item, app.locale),
    value: item.value,
  }))
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

async function loadPricingOptions() {
  const requestId = ++pricingRequestId
  const model = selectedModel.value
  pricingLoadFailed.value = false
  pricingReady.value = false
  pricingOptions.value = []
  pricingCatalogVersion.value = ''
  if (!model) return
  try {
    const usesV1 = model.sizeContractVersion === 'size-mode-v1'
    const catalogVersion = model.catalogVersion || ''
    if (usesV1 && !catalogVersion) throw new Error('The selected model has no catalog version')
    const result = await optionsStore.fetchModelPricing(model)
    if (requestId !== pricingRequestId) return

    let rawItems: unknown[]
    if (usesV1) {
      if (!isPricingEnvelope(result)
        || normalizeKey(result.modelCode) !== normalizeKey(model.value)
        || result.catalogVersion !== catalogVersion) {
        throw new Error('Image pricing catalog does not match the selected model')
      }
      rawItems = result.items
      pricingCatalogVersion.value = result.catalogVersion
    } else {
      rawItems = unwrapPricingResult(result)
    }
    pricingOptions.value = rawItems
      .map((item, index) => normalizePricingOption(item, index))
      .filter((item): item is AiImagePricingOption => Boolean(item))
    pricingReady.value = true
    reconcileModelSelection()
  } catch (error) {
    if (requestId !== pricingRequestId) return
    pricingLoadFailed.value = true
    throw error
  }
}

function applyReuseConfig() {
  const config = takeReuseConfig()
  const prompt = String(route.query.prompt || config?.prompt || '')
  const reference = route.query.reference
  const referenceImageUrls = Array.isArray(reference) ? reference.filter(Boolean).map(String) : reference ? [String(reference)] : config?.referenceImageUrls || []
  const sourceId = config?.sourcePromptId
  const isLibraryPrompt = typeof sourceId === 'number' && sourceId > 0 && prompt === config?.prompt

  if (isLibraryPrompt) {
    sourcePromptText.value = prompt
    sourcePromptId.value = sourceId
    draftStore.clearManualPrompt(draftUserId)
  }
  if (prompt) form.prompt = prompt
  if (config?.modelCode || config?.modelName) modelCode.value = config.modelCode || config.modelName || ''
  if (config?.modelCode || config?.modelName) {
    outputFormat.value = config.outputFormat || 'png'
    frameCount.value = config.frameCount ?? gifCapability.value?.defaultFrameCount
    frameDurationMs.value = config.frameDurationMs ?? gifCapability.value?.defaultFrameDurationMs
    if (selectedModel.value && !gifCapability.value) outputFormat.value = 'png'
  }
  const usesNewAuto = config?.sizeContractVersion === 'size-mode-v1' && config.sizeMode === 'auto'
  if (config?.sizeMode) sizeMode.value = config.sizeMode
  else if (config?.sizeContractVersion === 'legacy-aspect-auto' && config.aspectRatioCode === 'auto') sizeMode.value = 'auto'
  if (!usesNewAuto && config?.resolutionCode) {
    form.resolutionCode = config.resolutionCode
    lastExplicitResolutionCode.value = config.resolutionCode
  }
  if (config?.qualityCode) form.qualityCode = config.qualityCode
  if (!usesNewAuto && config?.aspectRatioCode) {
    form.aspectRatioCode = config.aspectRatioCode
    if (config.aspectRatioCode !== 'auto') lastExplicitAspectRatioCode.value = config.aspectRatioCode
  }
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
  downloadImage(imageUrl.value, `image-${globalThis.crypto?.randomUUID?.() || 'generated'}`)
}

function getTaskTimeoutMs(imageCount: number) {
  return Math.min(imageCount * TASK_TIMEOUT_PER_IMAGE_MS, MAX_TASK_TIMEOUT_MS)
}

function readSubmissionIntent(): Omit<CreateImageTaskRequest, 'idempotencyKey' | 'expectedUnitPoints'> {
  return {
    prompt: form.prompt,
    referenceImageUrls: [...form.referenceImageUrls],
    referenceAssetIds: [...form.referenceAssetIds],
    sourcePromptId: sourcePromptId.value,
    ...(supportsQuality.value ? { qualityCode: form.qualityCode } : {}),
    modelCode: modelCode.value,
    modelName: modelCode.value,
    imageCount: Math.min(batchSize.value, maxImageCount.value),
    ...outputParameters(),
  }
}

function outputParameters(): Partial<CreateImageTaskRequest> {
  if (isGif.value) return { outputFormat: 'gif', frameCount: frameCount.value, frameDurationMs: frameDurationMs.value, aspectRatioCode: form.aspectRatioCode }
  const explicit = { resolutionCode: form.resolutionCode, aspectRatioCode: form.aspectRatioCode }
  if (!usesSizeModeV1.value) return explicit
  const catalogVersion = selectedModel.value?.catalogVersion || ''
  return sizeMode.value === 'auto' ? { sizeMode: 'auto', catalogVersion } : { sizeMode: 'explicit', catalogVersion, ...explicit }
}

async function submit() {
  if (rateLimitRemainingSeconds.value > 0) return ElMessage.warning(rateLimitText.value)
  if (generationPrerequisitesUnavailable.value) {
    ElMessage.warning(generationDataError.value ? generationDataMessage.value : app.t('common.loading'))
    return
  }
  if (hasInsufficientPoints.value) {
    ElMessage.warning(app.t('playground.insufficientPoints'))
    return
  }
  if (referenceUploading.value) return ElMessage.warning(app.t('playground.referenceUploading'))
  if (!form.prompt.trim()) return ElMessage.warning(app.t('playground.prompt'))
  if (!validParameterSelection.value) return ElMessage.warning(app.t('playground.parametersRequired'))
  if (form.referenceImageUrls.length + form.referenceAssetIds.length > 6) return ElMessage.warning(app.t('playground.referenceLimit'))

  if (submitting.value) return
  const expectedUnitPoints = unitPoints.value
  if (expectedUnitPoints == null) return
  const intent = readSubmissionIntent()
  const userId = auth.user?.id
  const token = auth.token
  const imageCount = intent.imageCount
  activeImageCount.value = imageCount
  taskResults.value = []
  result.value = null
  selectedResultIndex.value = 0
  terminalFailureNoticeShown = false
  submitting.value = true
  const recoveryBaseline = await captureRecoveryBaseline()
  if (!viewActive) {
    submitting.value = false
    return
  }
  const submissionStartedAt = Date.now()
  let submittedRequest: CreateImageTaskRequest | null = null
  let submittedModelKeys: string[] = []
  try {
    await refreshModelCatalog()
    if (!viewActive) return
    if (!userId || auth.user?.id !== userId || token !== auth.token || token !== getStoredToken()
      || JSON.stringify(intent) !== JSON.stringify(readSubmissionIntent())) {
      ElMessage.warning(app.t('vipPricing.selectionChanged'))
      return
    }
    if (optionsLoadFailed.value || !quoteReady.value || !validParameterSelection.value || unitPoints.value == null) return
    if (selectedModel.value?.access?.available === false) { await offerMembership(); return }
    const unit = unitPoints.value
    if (unit > expectedUnitPoints) {
      ElMessage.warning(app.t(isGif.value ? 'gif.changed' : 'vipPricing.changed').replace('{price}', String(unit)))
      return
    }
    const requestWithoutKey = { ...intent, expectedUnitPoints: unit }
    const request: CreateImageTaskRequest = {
      ...requestWithoutKey,
      idempotencyKey: getOrCreateIdempotencyKey(requestWithoutKey),
    }
    submittedRequest = request
    submittedModelKeys = [request.modelCode, request.modelName || '', selectedModel.value?.name || '', selectedModel.value?.label || '']
    await performGeneration(request, imageCount)
  } catch (error) {
    await showGenerationError(
      error,
      app.t('playground.generationFailed'),
      submissionStartedAt,
      submittedRequest,
      submittedModelKeys,
      recoveryBaseline,
    )
  } finally {
    submitting.value = false
  }
}

async function performGeneration(request: CreateImageTaskRequest, imageCount: number) {
  const response = await generateImage(request)
  clearIdempotencyKey(request.idempotencyKey)
  handleInitialResult(response, {
    expiresAt: Date.now() + getTaskTimeoutMs(imageCount),
    imageCount,
  })
  void refreshCreditData()
}

async function showGenerationError(
  error: unknown,
  fallback: string,
  submissionStartedAt = Date.now(),
  submittedRequest: CreateImageTaskRequest | null = null,
  submittedModelKeys: string[] = [],
  recoveryBaseline: TaskRecoveryBaseline = { captured: false, taskIds: [] },
) {
  const apiError = error as ApiError
  const code = String(apiError?.code || '').trim().toUpperCase()
  if (!apiError?.status || apiError.status === 504 || code === 'GATEWAY_TIMEOUT') {
    if (!submittedRequest) {
      ElMessage.error(withRequestId(fallback, apiError?.requestId))
      return
    }
    if (auth.user?.id && submittedRequest) {
      startImageTaskHistoryRecovery(auth.user.id, submissionStartedAt, MAX_TASK_TIMEOUT_MS, {
        prompt: submittedRequest.prompt,
        modelKeys: submittedModelKeys.length
          ? submittedModelKeys
          : [submittedRequest.modelCode, submittedRequest.modelName || ''],
        imageCount: submittedRequest.imageCount,
        outputFormat: submittedRequest.outputFormat,
        frameCount: submittedRequest.frameCount,
        frameDurationMs: submittedRequest.frameDurationMs,
        sizeContractVersion: submittedRequest.sizeMode ? 'size-mode-v1' : selectedModel.value?.sizeContractVersion || null,
        sizeMode: submittedRequest.sizeMode || null,
        resolutionCode: submittedRequest.sizeMode === 'auto' ? '' : submittedRequest.resolutionCode || '',
        qualityCode: submittedRequest.qualityCode || '',
        aspectRatioCode: submittedRequest.sizeMode === 'auto' ? '' : submittedRequest.aspectRatioCode || '',
        referenceCount: submittedRequest.referenceAssetIds.length + submittedRequest.referenceImageUrls.length,
        sourcePromptId: submittedRequest.sourcePromptId || null,
        baselineCaptured: recoveryBaseline.captured,
        baselineTaskIds: recoveryBaseline.taskIds,
      })
    }
    ElMessage.warning(app.t('playground.generationResultUnknown'))
    void refreshCreditData()
    void router.push({ name: 'images' })
    return
  }
  if (code === 'GIF_NOT_SUPPORTED') {
    await refreshModelCatalog()
    ElMessage.warning(withRequestId(app.t('gif.unavailable'), apiError.requestId))
    return
  }
  if (code === 'AUTO_SIZE_NOT_SUPPORTED') {
    if (submittedRequest) clearIdempotencyKey(submittedRequest.idempotencyKey)
    await refreshModelCatalog()
    ElMessage.error(withRequestId(app.t('playground.autoSizeNotSupported'), apiError.requestId))
    return
  }
  if (code === 'IMAGE_CATALOG_CHANGED') {
    if (submittedRequest) clearIdempotencyKey(submittedRequest.idempotencyKey)
    await refreshModelCatalog()
    ElMessage.warning(withRequestId(app.t('playground.catalogChanged'), apiError.requestId))
    return
  }
  if (code === 'VIP_REQUIRED' || code === 'PRICE_CHANGED') {
    await refreshModelCatalog()
    if (code === 'VIP_REQUIRED') await offerMembership(submittedRequest?.modelCode)
    else ElMessage.warning(app.t(submittedRequest?.outputFormat === 'gif' ? 'gif.changed' : 'vipPricing.changed').replace('{price}', String((apiError?.details as { effectivePoints?: number })?.effectivePoints ?? unitPoints.value ?? '—')))
    return
  }
  if (code === 'RATE_LIMITED'  || apiError?.status === 429) {
    startRateLimit(Math.max(1, Number(apiError.retryAfterSeconds) || 1))
    ElMessage.warning(rateLimitText.value)
    return
  }
  if (apiError?.status === 403) {
    generationBlocked.value = true
    ElMessage.error(withRequestId(app.t('playground.generationForbidden'), apiError.requestId))
    return
  }
  if (apiError?.status === 409 || code === 'IDEMPOTENCY_CONFLICT') {
    localStorage.removeItem(SUBMISSION_STORAGE_KEY)
    ElMessage.error(withRequestId(app.t('playground.idempotencyConflict'), apiError.requestId))
    return
  }
  if (apiError?.status === 422 || code === 'PROMPT_BLOCKED') {
    ElMessage.warning(withRequestId(app.t('playground.promptBlocked'), apiError.requestId))
    return
  }
  if (apiError?.status === 500 || apiError?.status === 503) {
    ElMessage.error(withRequestId(app.t('playground.serviceUnavailable'), apiError.requestId))
    return
  }
  ElMessage.error(withRequestId(fallback, apiError?.requestId))
}

function frameOptionLabel(count: number) {
  const label = app.t('gif.frameOption').replace('{count}', String(count))
  return count === gifCapability.value?.defaultFrameCount ? label + app.t('gif.defaultSuffix') : label
}

function durationOptionLabel(ms: number) {
  const label = `${ms} ms`
  return ms === gifCapability.value?.defaultFrameDurationMs ? label + app.t('gif.defaultSuffix') : label
}

async function refreshModelCatalog() {
  try {
    await loadImageOptions()
    if (!isGif.value) await loadPricingOptions()
  } catch {
    // The fail-closed notices already expose which prerequisite is unavailable.
  }
}

function withRequestId(message: string, requestId?: string) {
  return requestId ? `${message} (${app.t('playground.requestId')}: ${requestId})` : message
}

function startRateLimit(seconds: number) {
  clearRateLimit()
  rateLimitUntil = Date.now() + Math.max(1, Math.ceil(seconds)) * 1000
  updateRateLimit()
  rateLimitTimer = window.setInterval(updateRateLimit, 250)
}

function updateRateLimit() {
  rateLimitRemainingSeconds.value = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000))
  if (rateLimitRemainingSeconds.value === 0) clearRateLimit()
}

function clearRateLimit() {
  if (rateLimitTimer) window.clearInterval(rateLimitTimer)
  rateLimitTimer = null
  rateLimitUntil = 0
  rateLimitRemainingSeconds.value = 0
}

function getOrCreateIdempotencyKey(payload: Omit<CreateImageTaskRequest, 'idempotencyKey'>) {
  const fingerprint = JSON.stringify(getSubmissionIntent(payload))
  try {
    const stored = JSON.parse(localStorage.getItem(SUBMISSION_STORAGE_KEY) || 'null') as { fingerprint?: string; key?: string; createdAt?: number } | null
    if (stored?.fingerprint === fingerprint && stored.key && Date.now() - Number(stored.createdAt) < SUBMISSION_MAX_AGE_MS) {
      return stored.key
    }
  } catch {
    localStorage.removeItem(SUBMISSION_STORAGE_KEY)
  }

  const key = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify({ fingerprint, key, createdAt: Date.now() }))
  return key
}

function getSubmissionIntent(payload: Omit<CreateImageTaskRequest, 'idempotencyKey'>) {
  const { catalogVersion: _catalogVersion, expectedUnitPoints: _expected, ...intent } = payload
  if (intent.sizeMode !== 'auto') return intent
  const { resolutionCode: _resolutionCode, aspectRatioCode: _aspectRatioCode, ...autoIntent } = intent
  return autoIntent
}

function clearIdempotencyKey(key: string) {
  try {
    const stored = JSON.parse(localStorage.getItem(SUBMISSION_STORAGE_KEY) || 'null') as { key?: string } | null
    if (stored?.key === key) localStorage.removeItem(SUBMISSION_STORAGE_KEY)
  } catch {
    localStorage.removeItem(SUBMISSION_STORAGE_KEY)
  }
}
</script>

<style scoped>
.format-toggle { --el-segmented-item-selected-bg-color: var(--color-primary-soft); --el-segmented-item-selected-color: var(--color-primary); padding: 4px; }
.format-toggle :deep(.el-segmented__item) { min-height: 44px; font-size: 16px; font-weight: 700; }
.format-toggle :deep(.el-segmented__item-selected) { border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent); }
.playground-grid { display: grid; grid-template-columns: minmax(0, 500px) minmax(0, 1fr); gap: 24px; align-items: stretch; }
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
.inline-parameter-row.single-parameter { grid-template-columns: 1fr; }
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
.generate.is-disabled,
.generate.is-disabled:hover,
.generate.is-disabled:focus {
  border-color: color-mix(in srgb, var(--color-text-muted) 20%, var(--color-border));
  background: color-mix(in srgb, var(--color-text-muted) 16%, var(--color-surface));
  color: color-mix(in srgb, var(--color-text-muted) 72%, var(--color-surface));
  box-shadow: none;
}
.generate-row { display: grid; gap: 8px; }
.cost-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.insufficient-notice { min-width: 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--color-warning) 45%, var(--color-border)); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-warning) 9%, var(--color-surface)); display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--color-warning); font-size: 13px; font-weight: 700; }
.insufficient-notice .el-button { flex: 0 0 auto; margin: 0; }
.generation-data-notice { min-width: 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--el-color-danger) 38%, var(--color-border)); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--el-color-danger) 7%, var(--color-surface)); display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--el-color-danger); font-size: 13px; font-weight: 700; }
.generation-data-notice .el-button { flex: 0 0 auto; margin: 0; }
.deduction-rule { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }
.credit-hint, .cost-hint, .rate-limit-hint { color: var(--color-text-muted); font-size: 13px; font-weight: 600; }
.cost-hint { color: var(--color-primary); }
.rate-limit-hint { color: var(--el-color-warning); }
@media (max-width: 1100px) { .playground-grid { grid-template-columns: 1fr; } }
@media (max-width: 520px) { .inline-parameter-row { grid-template-columns: 1fr; } .insufficient-notice { align-items: flex-start; flex-direction: column; } }
</style>
