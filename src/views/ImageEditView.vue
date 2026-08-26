<template>
  <div class="detail-page">
    <el-skeleton v-if="loading" :rows="10" animated />
    <section v-else-if="errorMessage" class="visual-panel page-card error-panel">
      <EmptyState :title="app.t('imageDetail.loadFailedTitle')" :description="errorMessage">
        <el-button type="primary" @click="router.push('/images')">{{ app.t('imageDetail.backToGallery') }}</el-button>
      </EmptyState>
    </section>
    <template v-else>
      <section class="visual-panel page-card">
        <div class="visual-toolbar">
          <div>
            <h2>{{ app.t('imageDetail.previewTitle') }}</h2>
            <p>{{ app.t('imageDetail.previewDescription') }}</p>
          </div>
          <div class="visual-actions">
            <el-button @click="copyPrompt">{{ app.t('imageDetail.copy') }}</el-button>
            <el-button @click="downloadCurrent">{{ app.t('common.download') }}</el-button>
            <el-button type="primary" plain @click="toggleFavorite" :title="favorite ? app.t('gallery.unfavorite') : app.t('gallery.favorite')">{{ favorite ? '❤️' : '🤍' }}</el-button>
          </div>
        </div>
        <div v-if="imageUrl" class="image-preview-wrap">
          <el-image class="hero-image" :src="imageUrl" :preview-src-list="imageUrls" :initial-index="selectedIndex" fit="contain" preview-teleported>
            <template #error>
              <div class="image-error">{{ app.t('imageDetail.imageLoadFailed') }}</div>
            </template>
          </el-image>
          <div v-if="imageUrls.length > 1" class="thumbnail-strip" role="list" :aria-label="app.t('imageDetail.thumbnailListLabel')">
            <button
              v-for="(url, index) in imageUrls"
              :key="url"
              class="thumbnail-button"
              :class="{ active: index === selectedIndex }"
              type="button"
              role="listitem"
              @click="selectedIndex = index"
            >
              <img :src="url" :alt="thumbnailAlt(index)" @error="hideBrokenThumbnail" />
              <span>{{ index + 1 }}</span>
            </button>
          </div>
        </div>
        <EmptyState v-else :title="taskStateTitle" :description="taskStateDescription" />
      </section>

      <aside class="control-panel page-card">
        <section>
          <h3>{{ app.t('imageDetail.prompt') }}</h3>
          <el-input v-model="prompt" type="textarea" :rows="6" />
        </section>

        <section>
          <h3>{{ app.t('imageDetail.parameters') }}</h3>
          <div class="params-grid">
            <span>{{ app.t('playground.model') }}</span><strong>{{ record?.modelCode || record?.modelName || '-' }}</strong>
            <span>{{ app.t('imageDetail.sizeMode') }}</span><strong>{{ sizeModeText }}</strong>
            <span>{{ app.t('imageDetail.requestedSize') }}</span><strong>{{ requestedSizeText }}</strong>
            <span>{{ app.t('imageDetail.outputSize') }}</span><strong>{{ outputSizeText }}</strong>
            <span>{{ app.t('playground.quality') }}</span><strong>{{ record?.qualityCode || '-' }}</strong>
            <span v-if="!isNewAutoTask">{{ app.t('playground.aspectRatio') }}</span><strong v-if="!isNewAutoTask">{{ record?.requestedAspectRatioCode || record?.aspectRatioCode || '-' }}</strong>
            <span>{{ app.t('gallery.pointCost') }}</span><strong>{{ record?.pointCost ?? '-' }}</strong>
            <span>{{ app.t('imageDetail.billingStatus') }}</span><strong>{{ billingStatusText }}</strong>
          </div>
        </section>

        <section>
          <h3>{{ app.t('imageDetail.references') }}</h3>
          <div v-if="referenceImages.length" class="reference-grid">
            <el-image v-for="url in referenceImages" :key="url" :src="url" :preview-src-list="referenceImages" fit="cover" preview-teleported />
          </div>
          <p v-else class="muted">{{ app.t('imageDetail.noReferences') }}</p>
        </section>

        <div class="bottom-actions">
          <el-button type="primary" class="soft-button" :disabled="!canReuse" @click="reuseConfig">{{ app.t('imageDetail.editImage') }}</el-button>
          <el-button :disabled="!canReuse" @click="reuseConfig">{{ app.t('imageDetail.reuseConfig') }}</el-button>
          <el-button @click="usePrompt">{{ app.t('imageDetail.usePrompt') }}</el-button>
          <el-button @click="useAsReference">{{ app.t('imageDetail.useAsReference') }}</el-button>
        </div>
      </aside>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import { useAuthenticatedImageUrls } from '@/composables/useAuthenticatedImageUrls'
import { isProcessing, normalizeTaskStatus, useImageTaskPolling } from '@/composables/useImageTaskPolling'
import { favoriteImageRecord, getImageRecord } from '@/services/aiImages'
import { useAppStore } from '@/stores/app'
import { useCreditsStore } from '@/stores/credits'
import { downloadImage, getImageUrls, saveReuseConfig } from '@/utils/imageActions'
import type { ApiError } from '@/types/api'
import type { ImageRecord } from '@/types/image'

const app = useAppStore()
const credits = useCreditsStore()
const route = useRoute()
const router = useRouter()
const record = ref<ImageRecord | null>(null)
const prompt = ref('')
const loading = ref(false)
const errorMessage = ref('')
const selectedIndex = ref(0)
const taskExpired = ref(false)
let pollingErrorShown = false
const sourceImageUrls = computed(() => getImageUrls(record.value))
const { urls: imageUrls } = useAuthenticatedImageUrls(sourceImageUrls)
const imageUrl = computed(() => imageUrls.value[selectedIndex.value] || '')
const sourceImageUrl = computed(() => sourceImageUrls.value[selectedIndex.value] || '')
const sourceReferenceImages = computed(() => record.value?.referenceImageUrls || [])
const { urls: referenceImages } = useAuthenticatedImageUrls(sourceReferenceImages)
const favorite = computed(() => Boolean(record.value?.favoriteUrls?.includes(sourceImageUrl.value)))
const canReuse = computed(() => record.value?.sizeContractVersion !== 'legacy-unknown')
const isNewAutoTask = computed(() => record.value?.sizeContractVersion === 'size-mode-v1' && record.value?.sizeMode === 'auto')
const sizeModeText = computed(() => {
  if (record.value?.sizeMode === 'auto') return app.t('playground.sizeModeAuto')
  if (record.value?.sizeMode === 'explicit' || record.value?.sizeContractVersion === 'legacy-explicit-v1') return app.t('playground.sizeModeExplicit')
  return '-'
})
const requestedSizeText = computed(() => {
  if (isNewAutoTask.value) return app.t('playground.sizeModeAuto')
  if (record.value?.sizeContractVersion === 'legacy-aspect-auto') {
    return [record.value.resolutionCode, record.value.aspectRatioCode || 'auto'].filter(Boolean).join(' / ') || 'auto'
  }
  return record.value?.requestedSize
    || [record.value?.requestedResolutionCode ?? record.value?.resolutionCode, record.value?.requestedAspectRatioCode ?? record.value?.aspectRatioCode]
      .filter(Boolean)
      .join(' / ')
    || '-'
})
const outputSizeText = computed(() => {
  const width = record.value?.outputWidth
  const height = record.value?.outputHeight
  if (isPositiveDimension(width) && isPositiveDimension(height)) return `${width}x${height}`
  const outputSize = String(record.value?.outputSize || '').trim()
  if (outputSize && outputSize !== '0x0') return outputSize
  return app.t('gallery.actualSizeUnknown')
})
const billingStatusText = computed(() => {
  if (!record.value) return '-'
  const keys: Record<number, string> = {
    0: 'gallery.billingReserved',
    1: 'gallery.billingConfirmed',
    2: 'gallery.billingPartialRefund',
    3: 'gallery.billingFullRefundSettled',
  }
  const key = keys[Number(record.value.billingStatus)]
  return key ? app.t(key) : app.t('gallery.billingUnknown')
})
const taskStateTitle = computed(() => {
  if (taskExpired.value) return app.t('imageDetail.taskExpiredTitle')
  const status = record.value ? normalizeTaskStatus(record.value) : ''
  if (status === 'queued') return app.t('gallery.taskQueued')
  if (status === 'processing') return app.t('gallery.taskProcessing')
  if (status === 'failed') return app.t('gallery.taskFailed')
  if (status === 'cancelled') return app.t('gallery.taskCancelled')
  return app.t('gallery.taskPending')
})
const taskStateDescription = computed(() => {
  if (taskExpired.value) return app.t('imageDetail.taskExpiredDescription')
  const status = record.value ? normalizeTaskStatus(record.value) : ''
  return status === 'queued' || status === 'processing'
    ? app.t('imageDetail.taskProcessingDescription')
    : app.t('playground.failureSettlementNotice')
})
const { start: startTaskPolling } = useImageTaskPolling({
  onUpdate: (task) => {
    pollingErrorShown = false
    applyRecord(task as ImageRecord)
  },
  onSuccess: (task) => {
    applyRecord(task as ImageRecord)
    void refreshCreditData()
  },
  onFailure: (task) => {
    applyRecord(task as ImageRecord)
    ElMessage.warning(app.t('playground.failureSettlementNotice'))
    void refreshCreditData()
  },
  onExpired: () => {
    taskExpired.value = true
    ElMessage.warning(app.t('playground.generationExpired'))
    void refreshCreditData()
  },
  onUnavailable: () => {
    errorMessage.value = app.t('imageDetail.unavailable')
    void refreshCreditData()
  },
  onError: (error) => {
    if (pollingErrorShown) return
    pollingErrorShown = true
    ElMessage.error(withRequestId(app.t('imageDetail.taskStatusUnavailable'), error))
  },
})

onMounted(async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const detail = await getImageRecord(String(route.params.id))
    if (!detail) {
      errorMessage.value = app.t('imageDetail.unavailable')
      return
    }
    applyRecord(detail)
    if (isProcessing(detail)) {
      startTaskPolling(detail.taskId || detail.id, {
        expiresAt: taskExpiration(detail),
        imageCount: detail.imageCount,
      })
    }
  } catch (error) {
    errorMessage.value = withRequestId(app.t('imageDetail.loadFailedDescription'), error)
  } finally {
    loading.value = false
  }
})

function applyRecord(detail: ImageRecord) {
  const firstLoad = !record.value
  record.value = detail
  if (firstLoad) {
    prompt.value = detail.prompt || ''
    selectInitialImage()
  } else if (selectedIndex.value >= sourceImageUrls.value.length) {
    selectedIndex.value = 0
  }
}

function taskExpiration(detail: ImageRecord) {
  const serverExpiration = detail.expiresAt ? Date.parse(detail.expiresAt) : Number.NaN
  if (Number.isFinite(serverExpiration)) return serverExpiration
  return Date.now() + Math.min(Math.max(1, detail.imageCount || 1) * 5 * 60 * 1000, 10 * 60 * 1000)
}

function refreshCreditData() {
  return Promise.allSettled([credits.fetchSummary(), credits.fetchRecords()])
}

function selectInitialImage() {
  const urls = sourceImageUrls.value
  const queryUrl = typeof route.query.url === 'string' ? route.query.url : ''
  const queryIndex = queryUrl ? urls.indexOf(queryUrl) : -1
  selectedIndex.value = queryIndex >= 0 ? queryIndex : 0
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(prompt.value)
    ElMessage.success(app.t('imageDetail.copySuccess'))
  } catch {
    ElMessage.warning(prompt.value)
  }
}

function hideBrokenThumbnail(event: Event) {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}

function downloadCurrent() {
  downloadImage(sourceImageUrl.value, `image-${record.value?.id || globalThis.crypto?.randomUUID?.() || 'generated'}.png`)
}

async function toggleFavorite() {
  if (!record.value) return
  const currentRecord = record.value
  const id = currentRecord.id || currentRecord.taskId
  if (!id) return ElMessage.warning(app.t('gallery.missingImageId'))
  const url = sourceImageUrl.value
  if (!url) return ElMessage.warning(app.t('gallery.missingImageUrl'))

  const next = !currentRecord.favoriteUrls.includes(url)
  const previousFavoriteUrls = [...currentRecord.favoriteUrls]
  currentRecord.favoriteUrls = next
    ? [...new Set([...previousFavoriteUrls, url])]
    : previousFavoriteUrls.filter((item) => item !== url)
  currentRecord.isFavorite = currentRecord.favoriteUrls.length > 0
  currentRecord.favorite = currentRecord.isFavorite

  try {
    await favoriteImageRecord(id, url, next)
    ElMessage.success(app.t(next ? 'gallery.favoriteAdded' : 'gallery.favoriteRemoved'))
  } catch (error) {
    currentRecord.favoriteUrls = previousFavoriteUrls
    currentRecord.isFavorite = previousFavoriteUrls.length > 0
    currentRecord.favorite = currentRecord.isFavorite
    ElMessage.error(withRequestId(app.t('imageDetail.favoriteUpdateFailed'), error))
  }
}

function thumbnailAlt(index: number) {
  return app.t('imageDetail.thumbnailAlt').replace('{index}', String(index + 1))
}

function withRequestId(message: string, error: unknown) {
  const requestId = (error as Partial<ApiError> | undefined)?.requestId
  return requestId ? `${message} (${app.t('imageDetail.requestId')}: ${requestId})` : message
}

function currentConfig() {
  if (!record.value) return null
  const usesNewAuto = record.value.sizeContractVersion === 'size-mode-v1' && record.value.sizeMode === 'auto'
  return {
    prompt: prompt.value,
    modelName: record.value.modelName,
    modelCode: record.value.modelCode,
    sizeContractVersion: record.value.sizeContractVersion,
    sizeMode: record.value.sizeContractVersion === 'size-mode-v1' ? record.value.sizeMode : null,
    catalogVersion: record.value.catalogVersion,
    resolutionCode: usesNewAuto
      ? undefined
      : record.value.requestedResolutionCode || record.value.resolutionCode || undefined,
    qualityCode: record.value.qualityCode,
    aspectRatioCode: usesNewAuto
      ? undefined
      : record.value.requestedAspectRatioCode || record.value.aspectRatioCode || undefined,
    referenceImageUrls: record.value.referenceImageUrls || [],
  }
}

function reuseConfig() {
  if (!canReuse.value) {
    ElMessage.warning(app.t('imageDetail.reuseUnavailable'))
    return
  }
  const config = currentConfig()
  if (!config) return
  saveReuseConfig(config)
  router.push('/playground')
}

function isPositiveDimension(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

async function usePrompt() {
  await copyPrompt()
  router.push({ path: '/playground', query: { prompt: prompt.value } })
}

function useAsReference() {
  const url = sourceImageUrl.value
  if (!url) return
  const config = currentConfig() || { prompt: prompt.value }
  saveReuseConfig({ ...config, referenceImageUrls: [url] })
  router.push('/playground')
}

</script>

<style scoped>
.detail-page { display: grid; grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); gap: 24px; align-items: start; }
.visual-panel, .control-panel { min-width: 0; padding: 24px; }
.visual-panel { min-height: 680px; display: flex; flex-direction: column; gap: 18px; }
.visual-toolbar { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
h2, h3, p { margin: 0; }
.visual-toolbar p { margin-top: 8px; color: var(--color-text-muted); }
.visual-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
.image-preview-wrap { flex: 1; min-height: 0; display: grid; gap: 14px; }
.hero-image { width: 100%; min-height: 460px; border-radius: var(--radius-lg); background: var(--color-primary-soft); }
.image-error { width: 100%; min-height: 460px; display: grid; place-items: center; color: var(--color-text-muted); }
.hero-image :deep(img) { width: 100%; max-height: 640px; object-fit: contain; }
.loading-box { flex: 1; min-height: 460px; display: grid; place-items: center; border-radius: var(--radius-xl); background: linear-gradient(90deg, var(--color-primary-soft), var(--color-surface), var(--color-primary-soft)); background-size: 220% 100%; animation: shimmer 1.4s infinite; color: var(--color-text-muted); font-weight: 700; }
.control-panel { display: grid; gap: 22px; position: sticky; top: 24px; }
.control-panel section { display: grid; gap: 12px; }
.params-grid { display: grid; grid-template-columns: minmax(100px, auto) 1fr; gap: 10px 14px; }
.params-grid span, .muted { color: var(--color-text-muted); }
.reference-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 10px; }
.thumbnail-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 10px; }
.thumbnail-button { padding: 0; overflow: hidden; border: 2px solid transparent; border-radius: var(--radius-sm); background: var(--color-primary-soft); cursor: pointer; transition: border-color .18s ease, transform .18s ease; }
.thumbnail-button.active { border-color: var(--color-primary); box-shadow: var(--shadow-primary); }
.thumbnail-button:hover { transform: translateY(-1px); }
.thumbnail-button img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
.thumbnail-button span { display: none; padding: 28px 0; color: var(--color-text-muted); font-weight: 700; }
.thumbnail-button img[style*="display: none"] + span { display: block; }
.reference-grid .el-image { aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; background: var(--color-primary-soft); }
.bottom-actions { display: grid; gap: 10px; }
@keyframes shimmer { to { background-position: -220% 0; } }
@media (max-width: 1100px) { .detail-page { grid-template-columns: 1fr; } .control-panel { position: static; } }
@media (max-width: 680px) { .visual-toolbar { flex-direction: column; } .visual-actions { justify-content: flex-start; } }
</style>
