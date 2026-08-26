<template>
  <div class="gallery-page">
    <section class="toolbar page-card">
      <el-input
        v-model="searchDraft"
        class="search-input"
        clearable
        :placeholder="app.t('gallery.searchPlaceholder')"
        @keyup.enter="applySearch"
      />
      <el-button type="primary" class="soft-button" @click="applySearch">{{ app.t('gallery.search') }}</el-button>
      <el-select v-model="filters.model" clearable :placeholder="app.t('gallery.modelFilter')">
        <el-option v-for="item in modelOptions" :key="item.value" :label="item.name || item.label" :value="item.value" />
      </el-select>
      <el-date-picker
        v-model="filters.dates"
        type="daterange"
        unlink-panels
        value-format="YYYY-MM-DD"
        :start-placeholder="app.t('gallery.startDate')"
        :end-placeholder="app.t('gallery.endDate')"
      />
      <el-select v-model="filters.favorite" :placeholder="app.t('gallery.favoriteFilter')">
        <el-option :label="app.t('gallery.allImages')" value="all" />
        <el-option :label="app.t('gallery.onlyFavorites')" value="favorite" />
      </el-select>
    </section>

    <el-skeleton v-if="loading" :rows="8" animated />
    <EmptyState
      v-else-if="!galleryItems.length"
      :title="app.t(hasActiveFilters ? 'gallery.noMatchedTitle' : 'gallery.emptyTitle')"
      :description="app.t(hasActiveFilters ? 'gallery.noMatchedDescription' : 'gallery.emptyDescription')"
    >
      <el-button v-if="!hasActiveFilters" type="primary" @click="router.push('/playground')">{{ app.t('common.generate') }}</el-button>
    </EmptyState>
    <template v-else>
      <div class="grid">
        <ImageCard
          v-for="item in galleryItems"
          :key="item.key"
          :record="item.record"
          :image-source-url="item.imageUrl"
          :favorite="item.favorite"
          @preview="preview(item.record, item.imageUrl)"
          @delete="remove(item.record)"
          @favorite="toggleFavorite(item.record, item.imageUrl)"
          @fullscreen="openFullscreen"
        />
      </div>
      <el-pagination
        v-model:current-page="pageIndex"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="fetchList"
      />
    </template>

    <el-image-viewer v-if="fullscreenUrl" :url-list="[fullscreenUrl]" hide-on-click-modal @close="fullscreenUrl = ''" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import ImageCard from '@/components/images/ImageCard.vue'
import { isFailure, isProcessing, isSuccess, normalizeTaskStatus } from '@/composables/useImageTaskPolling'
import { deleteImageRecord, favoriteImageRecord, getImageRecords } from '@/services/aiImages'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'
import { useImageOptionsStore } from '@/stores/imageOptions'
import { getImageUrls } from '@/utils/imageActions'
import {
  clearImageTaskHistoryRecovery,
  readImageTaskHistoryRecovery,
  type ImageTaskHistoryRecovery,
} from '@/utils/imageTaskRecovery'
import type { ApiError } from '@/types/api'
import type { ImageRecord } from '@/types/image'

type FavoriteFilter = 'all' | 'favorite'

const app = useAppStore()
const auth = useAuthStore()
const router = useRouter()
const optionsStore = useImageOptionsStore()
const credits = useCreditsStore()
const records = ref<ImageRecord[]>([])
const total = ref(0)
const pageIndex = ref(1)
const pageSize = ref(12)
const loading = ref(false)
const searchDraft = ref('')
const searchKeyword = ref('')
const fullscreenUrl = ref('')
const filters = reactive<{ model: string; dates: [string, string] | null; favorite: FavoriteFilter }>({
  model: '',
  dates: null,
  favorite: 'all',
})
let pollTimer: ReturnType<typeof setTimeout> | null = null
let listRequestId = 0
let historyRecovery: ImageTaskHistoryRecovery | null = null
const RECOVERY_CLOCK_SKEW_MS = 60_000

const modelOptions = computed(() => optionsStore.options.models || [])
const hasActiveFilters = computed(() => Boolean(searchKeyword.value.trim() || filters.model || filters.dates || filters.favorite === 'favorite'))
const galleryItems = computed(() => records.value.flatMap((record) => {
  const urls = filters.favorite === 'favorite' ? record.favoriteUrls : getImageUrls(record)
  if (!urls.length && filters.favorite !== 'favorite') {
    return [{ key: `${record.id}:task`, record, imageUrl: '', favorite: false }]
  }
  return [...new Set(urls)].map((imageUrl) => ({
    key: `${record.id}:${imageUrl}`,
    record,
    imageUrl,
    favorite: record.favoriteUrls.includes(imageUrl),
  }))
}))
watch(filters, () => {
  pageIndex.value = 1
  void fetchList()
})
watch(searchKeyword, () => {
  pageIndex.value = 1
  void fetchList()
})

onMounted(() => {
  historyRecovery = readImageTaskHistoryRecovery(auth.user?.id ?? null)
  void optionsStore.fetchOptions().catch(() => undefined)
  void fetchList()
})
onBeforeUnmount(() => {
  ++listRequestId
  clearPolling()
})

async function fetchList() {
  return loadList(true)
}

async function loadList(showLoading: boolean) {
  const requestId = ++listRequestId
  clearPolling()
  if (showLoading) loading.value = true
  try {
    const [startDate, endDate] = filters.dates || []
    const result = await getImageRecords({
      pageIndex: pageIndex.value,
      pageSize: pageSize.value,
      prompt: searchKeyword.value.trim() || undefined,
      isFavorite: filters.favorite === 'favorite' ? true : undefined,
      startDate,
      endDate,
      modelName: filters.model || undefined,
    })
    if (requestId !== listRequestId) return
    const previousProcessingIds = new Set(records.value.filter(isProcessing).map(taskKey))
    const nextProcessingIds = new Set(result.items.filter(isProcessing).map(taskKey))
    records.value = result.items
    total.value = result.total
    const recoverySettled = settleHistoryRecovery(result.items)
    schedulePolling(result.items)
    if (!recoverySettled && [...previousProcessingIds].some((id) => !nextProcessingIds.has(id))) {
      void refreshCreditData()
    }
  } catch (error) {
    if (requestId !== listRequestId) return
    if (showLoading) ElMessage.error(withRequestId(app.t('gallery.loadFailed'), error))
    schedulePolling(records.value)
  } finally {
    if (requestId === listRequestId && showLoading) loading.value = false
  }
}

function schedulePolling(items: ImageRecord[]) {
  const processing = items.filter(isProcessing)
  if (historyRecovery && Date.now() >= historyRecovery.expiresAt) {
    finishHistoryRecovery()
    return
  }
  if (!processing.length && !historyRecovery) return
  const delay = !processing.length || processing.some((item) => normalizeTaskStatus(item) === 'queued') ? 3000 : 5000
  const recoveryDelay = historyRecovery
    ? Math.max(0, Math.min(delay, historyRecovery.expiresAt - Date.now()))
    : delay
  pollTimer = window.setTimeout(() => {
    pollTimer = null
    void loadList(false)
  }, recoveryDelay)
}

function settleHistoryRecovery(items: ImageRecord[]) {
  if (!historyRecovery) return false
  if (Date.now() >= historyRecovery.expiresAt) {
    finishHistoryRecovery()
    return true
  }

  const candidateTasks = items.filter((item) => {
    const createdAt = Date.parse(item.createdAt)
    const modelKeys = [item.modelCode, item.modelName].map(normalizeRecoveryKey).filter(Boolean)
    const taskId = taskKey(item)
    const sourcePromptId = typeof item.sourcePromptId === 'number' ? item.sourcePromptId : null
    return historyRecovery!.baselineCaptured
      && !historyRecovery!.baselineTaskIds.includes(taskId)
      && Number.isFinite(createdAt)
      && createdAt >= historyRecovery!.startedAt - RECOVERY_CLOCK_SKEW_MS
      && item.prompt === historyRecovery!.prompt
      && item.imageCount === historyRecovery!.imageCount
      && historyRecovery!.modelKeys.some((key) => modelKeys.includes(normalizeRecoveryKey(key)))
      && matchesRecoverySize(item, historyRecovery!)
      && normalizeRecoveryKey(item.qualityCode) === normalizeRecoveryKey(historyRecovery!.qualityCode)
      && (Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls.length : 0) === historyRecovery!.referenceCount
      && sourcePromptId === historyRecovery!.sourcePromptId
  })
  if (!candidateTasks.length || candidateTasks.some(isProcessing)) return false
  if (!candidateTasks.some((item) => isSuccess(item) || isFailure(item))) return false
  finishHistoryRecovery()
  return true
}

function matchesRecoverySize(item: ImageRecord, recovery: ImageTaskHistoryRecovery) {
  if (recovery.sizeMode) {
    if (item.sizeMode !== recovery.sizeMode) return false
    if (recovery.sizeContractVersion && item.sizeContractVersion !== recovery.sizeContractVersion) return false
    if (recovery.sizeMode === 'auto') return true
    return normalizeRecoveryKey(item.requestedResolutionCode ?? item.resolutionCode ?? '') === normalizeRecoveryKey(recovery.resolutionCode)
      && normalizeRecoveryKey(item.requestedAspectRatioCode ?? item.aspectRatioCode ?? '') === normalizeRecoveryKey(recovery.aspectRatioCode)
  }
  return normalizeRecoveryKey(item.resolutionCode ?? '') === normalizeRecoveryKey(recovery.resolutionCode)
    && normalizeRecoveryKey(item.aspectRatioCode ?? '') === normalizeRecoveryKey(recovery.aspectRatioCode)
}

function normalizeRecoveryKey(value: string | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function finishHistoryRecovery() {
  historyRecovery = null
  clearImageTaskHistoryRecovery()
  clearPolling()
  void refreshCreditData()
}

function refreshCreditData() {
  return Promise.allSettled([credits.fetchSummary(), credits.fetchRecords()])
}

function clearPolling() {
  if (pollTimer) window.clearTimeout(pollTimer)
  pollTimer = null
}

function taskKey(record: ImageRecord) {
  return String(record.taskId || record.id)
}

function applySearch() {
  searchKeyword.value = searchDraft.value
}

function preview(record: ImageRecord, imageUrl: string) {
  const id = record.id || record.taskId
  if (!id) return
  router.push({ path: `/images/${id}/edit`, query: imageUrl ? { url: imageUrl } : undefined })
}

async function toggleFavorite(record: ImageRecord, imageUrl: string) {
  if (!record.id) return ElMessage.warning(app.t('gallery.missingImageId'))
  if (!imageUrl) return ElMessage.warning(app.t('gallery.missingImageUrl'))

  const next = !record.favoriteUrls?.includes(imageUrl)
  const previousFavoriteUrls = [...(record.favoriteUrls || [])]
  record.favoriteUrls = next
    ? [...new Set([...previousFavoriteUrls, imageUrl])]
    : previousFavoriteUrls.filter((url) => url !== imageUrl)
  record.isFavorite = record.favoriteUrls.length > 0
  record.favorite = record.isFavorite

  try {
    await favoriteImageRecord(record.id, imageUrl, next)
    ElMessage.success(app.t(next ? 'gallery.favoriteAdded' : 'gallery.favoriteRemoved'))
  } catch (error) {
    record.favoriteUrls = previousFavoriteUrls
    record.isFavorite = previousFavoriteUrls.length > 0
    record.favorite = record.isFavorite
    ElMessage.error(withRequestId(app.t('gallery.favoriteUpdateFailed'), error))
  }
}

function openFullscreen(url: string) {
  fullscreenUrl.value = url
}

async function remove(record: ImageRecord) {
  if (!record.id) return ElMessage.warning(app.t('gallery.missingImageId'))
  try {
    await ElMessageBox.confirm(app.t('common.delete'), app.t('common.confirm'))
    await deleteImageRecord(record.id)
    if (records.value.length === 1 && pageIndex.value > 1) pageIndex.value -= 1
    await fetchList()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(withRequestId(app.t('gallery.deleteFailed'), error))
  }
}

function withRequestId(message: string, error: unknown) {
  const requestId = (error as Partial<ApiError> | undefined)?.requestId
  return requestId ? `${message} (${app.t('gallery.requestId')}: ${requestId})` : message
}
</script>

<style scoped>
.gallery-page { display: grid; gap: 18px; }
.toolbar { padding: 16px; display: grid; grid-template-columns: minmax(220px, 1fr) auto minmax(160px, .55fr) minmax(250px, .8fr) minmax(150px, .45fr); gap: 12px; align-items: center; }
.search-input { min-width: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; margin-bottom: 6px; }
:deep(.el-date-editor.el-input__wrapper) { width: 100%; }
@media (max-width: 1180px) { .toolbar { grid-template-columns: 1fr 1fr; } }
@media (max-width: 680px) { .toolbar { grid-template-columns: 1fr; } }
</style>
