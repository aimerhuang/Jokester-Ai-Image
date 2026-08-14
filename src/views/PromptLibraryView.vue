<template>
  <div class="prompt-library-page">
    <section class="library-toolbar page-card" aria-label="Prompt search">
      <el-segmented
        v-model="searchField"
        class="search-fields"
        :options="searchFieldOptions"
        @change="applySearch"
      />
      <el-input
        v-model="searchDraft"
        class="search-input"
        clearable
        maxlength="100"
        :prefix-icon="Search"
        :placeholder="app.t('promptLibrary.searchPlaceholder')"
        @keyup.enter="applySearch"
        @clear="applySearch"
      />
      <el-button type="primary" class="soft-button search-button" :icon="Search" @click="applySearch">
        {{ app.t('promptLibrary.search') }}
      </el-button>
    </section>

    <div class="library-meta">
      <span>{{ resultCountText }}</span>
      <span class="source-note">{{ app.t('promptLibrary.attribution') }}</span>
    </div>

    <div v-if="loading" class="prompt-grid" aria-live="polite" :aria-label="app.t('common.loading')">
      <article v-for="index in 8" :key="index" class="prompt-skeleton page-card">
        <el-skeleton animated>
          <template #template>
            <el-skeleton-item variant="image" class="skeleton-image" />
            <div class="skeleton-body">
              <el-skeleton-item variant="h3" style="width: 76%" />
              <el-skeleton-item variant="text" />
              <el-skeleton-item variant="text" style="width: 62%" />
            </div>
          </template>
        </el-skeleton>
      </article>
    </div>

    <el-result
      v-else-if="listError"
      icon="error"
      :title="app.t('promptLibrary.loadFailed')"
      :sub-title="listError"
    >
      <template #extra>
        <el-button type="primary" :icon="Refresh" @click="fetchList">{{ app.t('common.retry') }}</el-button>
      </template>
    </el-result>

    <section v-else-if="!items.length" class="empty-library">
      <el-icon><Collection /></el-icon>
      <h2>{{ app.t(searchKeyword ? 'promptLibrary.noResults' : 'promptLibrary.emptyTitle') }}</h2>
      <p>{{ app.t(searchKeyword ? 'promptLibrary.noResultsDescription' : 'promptLibrary.emptyDescription') }}</p>
      <el-button v-if="searchKeyword" :icon="RefreshLeft" @click="resetSearch">
        {{ app.t('promptLibrary.clearSearch') }}
      </el-button>
    </section>

    <template v-else>
      <div class="prompt-grid">
        <PromptCard
          v-for="item in items"
          :key="item.id"
          :item="item"
          :busy-action="cardAction?.id === item.id ? cardAction.type : null"
          @open="openDetail"
          @copy="copyFromCard"
          @use="useFromCard"
        />
      </div>

      <el-pagination
        v-model:current-page="pageIndex"
        class="pagination"
        :page-size="pageSize"
        :total="total"
        :pager-count="5"
        background
        layout="prev, pager, next"
        @current-change="changePage"
      />
    </template>

    <PromptDetailDialog
      v-model="detailVisible"
      :prompt="selectedPrompt"
      :loading="detailLoading"
      :error="detailError"
      :action="detailAction"
      @copy="copyFromDialog"
      @use="useFromDialog"
      @retry="retryDetail"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Collection, Refresh, RefreshLeft, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import PromptCard from '@/components/prompts/PromptCard.vue'
import PromptDetailDialog from '@/components/prompts/PromptDetailDialog.vue'
import { getPrompt, getPrompts, recordPromptEvent } from '@/services/prompts'
import { useAppStore } from '@/stores/app'
import { saveReuseConfig } from '@/utils/imageActions'
import type { ApiError } from '@/types/api'
import type {
  PromptLibraryDetail,
  PromptLibraryListItem,
  PromptSearchField,
} from '@/types/prompt'

type PromptAction = 'copy' | 'use'

const app = useAppStore()
const router = useRouter()
const items = ref<PromptLibraryListItem[]>([])
const total = ref(0)
const pageIndex = ref(1)
const pageSize = 24
const searchDraft = ref('')
const searchKeyword = ref('')
const searchField = ref<PromptSearchField>('all')
const loading = ref(false)
const listError = ref('')
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailTargetId = ref<number | null>(null)
const selectedPrompt = ref<PromptLibraryDetail | null>(null)
const detailAction = ref<PromptAction | null>(null)
const cardAction = ref<{ id: number; type: PromptAction } | null>(null)
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000
const detailCache = new Map<number, { prompt: PromptLibraryDetail; cachedAt: number }>()
let listRequestVersion = 0
let detailRequestVersion = 0

const searchFieldOptions = computed(() => [
  { label: app.t('promptLibrary.searchAll'), value: 'all' as const },
  { label: app.t('promptLibrary.searchTitle'), value: 'title' as const },
  { label: app.t('promptLibrary.searchPrompt'), value: 'prompt' as const },
])
const resultCountText = computed(() => app.t('promptLibrary.resultCount').replace('{count}', String(total.value)))

onMounted(fetchList)

async function fetchList() {
  const requestVersion = ++listRequestVersion
  loading.value = true
  listError.value = ''

  try {
    const result = await getPrompts({
      pageIndex: pageIndex.value,
      pageSize,
      keyword: searchKeyword.value || undefined,
      searchField: searchField.value,
    })
    if (requestVersion !== listRequestVersion) return

    items.value = result.items
    total.value = result.total
    detailCache.clear()
  } catch (error) {
    if (requestVersion !== listRequestVersion) return
    items.value = []
    total.value = 0
    listError.value = getErrorMessage(error, app.t('promptLibrary.loadFailed'))
  } finally {
    if (requestVersion === listRequestVersion) loading.value = false
  }
}

function applySearch() {
  searchKeyword.value = searchDraft.value.trim()
  pageIndex.value = 1
  void fetchList()
}

function resetSearch() {
  searchDraft.value = ''
  searchKeyword.value = ''
  searchField.value = 'all'
  pageIndex.value = 1
  void fetchList()
}

function changePage() {
  void fetchList()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function loadDetail(id: number, force = false) {
  const cached = detailCache.get(id)
  if (cached && !force && Date.now() - cached.cachedAt < DETAIL_CACHE_TTL_MS) return cached.prompt

  const prompt = await getPrompt(id)
  detailCache.set(id, { prompt, cachedAt: Date.now() })
  return prompt
}

async function openDetail(item: PromptLibraryListItem) {
  const requestVersion = ++detailRequestVersion
  detailTargetId.value = item.id
  selectedPrompt.value = null
  detailError.value = ''
  detailLoading.value = true
  detailVisible.value = true

  try {
    const prompt = await loadDetail(item.id)
    if (requestVersion !== detailRequestVersion || detailTargetId.value !== item.id || !detailVisible.value) return
    selectedPrompt.value = prompt
    void recordPromptEvent(prompt.id, 'detail_view').catch(() => undefined)
  } catch (error) {
    if (requestVersion !== detailRequestVersion) return
    detailError.value = getErrorMessage(error, app.t('promptLibrary.detailLoadFailed'))
  } finally {
    if (requestVersion === detailRequestVersion) detailLoading.value = false
  }
}

async function retryDetail() {
  const id = detailTargetId.value
  if (!id) return

  const item = items.value.find((candidate) => candidate.id === id) || {
    id,
    title: '',
    description: '',
    promptPreview: '',
    coverImageUrl: null,
    sourcePosition: 0,
  }
  detailCache.delete(id)
  await openDetail(item)
}

async function copyFromCard(item: PromptLibraryListItem) {
  if (cardAction.value) return
  cardAction.value = { id: item.id, type: 'copy' }
  try {
    await copyPrompt(await loadDetail(item.id))
  } catch (error) {
    ElMessage.error(getErrorMessage(error, app.t('promptLibrary.actionFailed')))
  } finally {
    cardAction.value = null
  }
}

async function useFromCard(item: PromptLibraryListItem) {
  if (cardAction.value) return
  cardAction.value = { id: item.id, type: 'use' }
  try {
    await usePrompt(await loadDetail(item.id))
  } catch (error) {
    ElMessage.error(getErrorMessage(error, app.t('promptLibrary.actionFailed')))
    cardAction.value = null
  }
}

async function copyFromDialog(prompt: PromptLibraryDetail) {
  if (detailAction.value) return
  detailAction.value = 'copy'
  try {
    await copyPrompt(prompt)
  } catch (error) {
    ElMessage.error(getErrorMessage(error, app.t('promptLibrary.actionFailed')))
  } finally {
    detailAction.value = null
  }
}

async function useFromDialog(prompt: PromptLibraryDetail) {
  if (detailAction.value) return
  detailAction.value = 'use'
  try {
    await usePrompt(prompt)
  } catch (error) {
    ElMessage.error(getErrorMessage(error, app.t('promptLibrary.actionFailed')))
    detailAction.value = null
  }
}

async function copyPrompt(prompt: PromptLibraryDetail) {
  await writeClipboard(prompt.promptText)
  ElMessage.success(app.t('promptLibrary.copySuccess'))
  void recordPromptEvent(prompt.id, 'copy').catch(() => undefined)
}

async function usePrompt(prompt: PromptLibraryDetail) {
  saveReuseConfig({ prompt: prompt.promptText, sourcePromptId: prompt.id })
  void recordPromptEvent(prompt.id, 'use').catch(() => undefined)
  await router.push({ name: 'playground' })
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall back for browsers that expose Clipboard API but deny writes.
    }
  }

  const input = document.createElement('textarea')
  input.value = text
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  let copied = false
  try {
    document.body.appendChild(input)
    input.select()
    copied = document.execCommand('copy')
  } finally {
    input.remove()
  }
  if (!copied) throw new Error(app.t('promptLibrary.copyFailed'))
}

function getErrorMessage(error: unknown, fallback: string) {
  const message = (error as ApiError | undefined)?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}
</script>

<style scoped>
.prompt-library-page { display: grid; gap: 18px; min-width: 0; }
.library-toolbar { display: grid; grid-template-columns: auto minmax(220px, 1fr) auto; align-items: center; gap: 12px; padding: 14px; border-radius: var(--radius-sm); }
.search-fields { min-width: 0; }
.search-input { min-width: 0; }
.search-button { min-width: 96px; }
.library-meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--color-text-muted); font-size: 13px; }
.source-note { text-align: right; }
.prompt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap: 18px; }
.prompt-skeleton { overflow: hidden; border-radius: var(--radius-sm); }
.skeleton-image { display: block; width: 100%; aspect-ratio: 4 / 3; }
.skeleton-body { display: grid; gap: 12px; padding: 16px; }
.empty-library { min-height: 340px; display: grid; place-items: center; align-content: center; gap: 12px; padding: 32px 16px; text-align: center; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
.empty-library .el-icon { font-size: 42px; color: var(--color-primary); }
.empty-library h2 { margin: 0; font-size: 20px; }
.empty-library p { max-width: 440px; margin: 0 0 4px; color: var(--color-text-muted); line-height: 1.6; }
.pagination { justify-content: center; padding: 10px 0 2px; overflow-x: auto; }

@media (max-width: 860px) {
  .library-toolbar { grid-template-columns: 1fr auto; }
  .search-fields { grid-column: 1 / -1; }
}

@media (max-width: 560px) {
  .library-toolbar { grid-template-columns: minmax(0, 1fr) auto; padding: 12px; }
  .search-fields { width: 100%; }
  .search-button { min-width: 42px; width: 42px; padding: 0; font-size: 0; }
  .search-button :deep(.el-icon) { margin: 0; font-size: 16px; }
  .library-meta { align-items: flex-start; flex-direction: column; gap: 6px; }
  .source-note { text-align: left; }
  .prompt-grid { grid-template-columns: 1fr; }
}
</style>
