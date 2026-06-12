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
    <EmptyState v-else-if="!records.length" :title="app.t('gallery.emptyTitle')" :description="app.t('gallery.emptyDescription')">
      <el-button type="primary" @click="router.push('/playground')">{{ app.t('common.generate') }}</el-button>
    </EmptyState>
    <EmptyState v-else-if="!filteredRecords.length" :title="app.t('gallery.noMatchedTitle')" :description="app.t('gallery.noMatchedDescription')" />
    <template v-else>
      <div class="grid">
        <ImageCard
          v-for="record in pagedRecords"
          :key="getImageKey(record)"
          :record="record"
          :favorite="Boolean(record.favorite || record.isFavorite)"
          @preview="preview"
          @delete="remove"
          @favorite="toggleFavorite"
          @fullscreen="openFullscreen"
        />
      </div>
      <el-pagination
        v-model:current-page="pageIndex"
        :page-size="pageSize"
        :total="filteredRecords.length"
        layout="prev, pager, next"
      />
    </template>

    <el-image-viewer v-if="fullscreenUrl" :url-list="[fullscreenUrl]" hide-on-click-modal @close="fullscreenUrl = ''" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import ImageCard from '@/components/images/ImageCard.vue'
import { deleteImageRecord, favoriteImageRecord, getImageRecords } from '@/services/aiImages'
import { useAppStore } from '@/stores/app'
import { useImageOptionsStore } from '@/stores/imageOptions'
import { getImageKey, getImageUrl } from '@/utils/imageActions'
import type { ApiError } from '@/types/api'
import type { ImageRecord } from '@/types/image'

type FavoriteFilter = 'all' | 'favorite'

const app = useAppStore()
const router = useRouter()
const optionsStore = useImageOptionsStore()
const records = ref<ImageRecord[]>([])
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

const modelOptions = computed(() => optionsStore.options.models || [])
const filteredRecords = computed(() => records.value)
const pagedRecords = computed(() => {
  const start = (pageIndex.value - 1) * pageSize.value
  return filteredRecords.value.slice(start, start + pageSize.value)
})

watch(filters, () => {
  pageIndex.value = 1
  void fetchList()
})
watch(searchKeyword, () => {
  pageIndex.value = 1
  void fetchList()
})
watch(filteredRecords, () => {
  const maxPage = Math.max(1, Math.ceil(filteredRecords.value.length / pageSize.value))
  if (pageIndex.value > maxPage) pageIndex.value = maxPage
})

onMounted(() => {
  void optionsStore.fetchOptions().catch(() => undefined)
  fetchList()
})

async function fetchList() {
  loading.value = true
  try {
    const [startDate, endDate] = filters.dates || []
    const result = await getImageRecords({
      pageIndex: 1,
      pageSize: 200,
      prompt: searchKeyword.value.trim() || undefined,
      isFavorite: filters.favorite === 'favorite' ? true : undefined,
      startDate,
      endDate,
      modelName: filters.model || undefined,
    })
    if (Array.isArray(result)) {
      records.value = result
    } else {
      records.value = result.items
    }
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    loading.value = false
  }
}

function applySearch() {
  searchKeyword.value = searchDraft.value
}

function preview(record: ImageRecord) {
  if (!record.id) return
  router.push(`/images/${record.id}/edit`)
}

async function toggleFavorite(record: ImageRecord) {
  if (!record.id) return ElMessage.warning(app.t('gallery.missingImageId'))
  const imageUrl = getImageUrl(record)
  if (!imageUrl) return ElMessage.warning(app.t('gallery.missingImageUrl'))

  const next = !Boolean(record.favorite || record.isFavorite)
  record.favorite = next
  record.isFavorite = next

  try {
    const updated = await favoriteImageRecord(record.id, { imageUrl, isFavorite: next })
    if (updated && typeof updated === 'object') {
      const serverFavorite = updated.isFavorite ?? updated.favorite
      if (typeof serverFavorite === 'boolean') {
        record.favorite = serverFavorite
        record.isFavorite = serverFavorite
      }
    }
    ElMessage.success((record.favorite || record.isFavorite) ? app.t('gallery.favoriteAdded') : app.t('gallery.favoriteRemoved'))
  } catch (error) {
    record.favorite = !next
    record.isFavorite = !next
    ElMessage.error((error as ApiError).message)
  }
}

function openFullscreen(url: string) {
  fullscreenUrl.value = url
}

async function remove(record: ImageRecord) {
  if (!record.id) return ElMessage.warning(app.t('gallery.missingImageId'))
  await ElMessageBox.confirm(app.t('common.delete'), app.t('common.confirm'))
  await deleteImageRecord(record.id)
  await fetchList()
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
