<template>
  <div class="canvas-list-page">
    <section class="canvas-list-header">
      <p>{{ subtitle }}</p>
    </section>

    <div v-if="loadFailed" class="canvas-list-error" role="alert">
      <span>{{ app.t('canvas.loadFailed') }}</span>
      <el-button link type="primary" @click="load">{{ app.t('common.retry') }}</el-button>
    </div>

    <div v-loading="loading" class="canvas-grid">
      <div class="canvas-card">
        <button class="canvas-create" type="button" :disabled="creating" data-testid="canvas-create" @click="create">
          <el-icon v-if="!creating"><Plus /></el-icon>
          <el-icon v-else class="is-loading"><Loading /></el-icon>
          <strong>{{ app.t('canvas.startCreating') }}</strong>
        </button>
        <div class="canvas-card-meta">
          <span class="canvas-card-hint">{{ app.t('canvas.startCreatingHint') }}</span>
        </div>
      </div>

      <div v-for="item in items" :key="item.canvasId" class="canvas-card" data-testid="canvas-card">
        <router-link class="canvas-cover" :to="{ name: 'canvas-editor', params: { canvasId: item.canvasId } }">
          <CanvasAuthImage v-if="item.coverUrl" :src="item.coverUrl" :alt="item.title" />
          <div v-else class="canvas-cover-empty"><el-icon><Connection /></el-icon></div>
        </router-link>
        <div class="canvas-card-meta">
          <div class="canvas-card-text">
            <strong :title="item.title">{{ item.title }}</strong>
            <span>{{ formatDate(item.updatedAt) }} · {{ formatStorageSize(item.storageBytes) }}</span>
          </div>
          <div class="canvas-card-actions">
            <button type="button" :aria-label="app.t('canvas.rename')" @click="rename(item)"><el-icon><EditPen /></el-icon></button>
            <button type="button" :aria-label="app.t('common.delete')" @click="remove(item)"><el-icon><Delete /></el-icon></button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="hasMore" class="canvas-list-more">
      <el-button :loading="loading" @click="loadMore">{{ app.t('canvas.loadMore') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Delete, EditPen, Loading, Plus } from '@element-plus/icons-vue'
import CanvasAuthImage from '@/components/canvas/CanvasAuthImage.vue'
import { createCanvas, deleteCanvas, getCanvases, renameCanvas } from '@/services/canvases'
import { useAppStore } from '@/stores/app'
import { formatStorageSize } from '@/utils/canvasDocument'
import type { ApiError } from '@/types/api'
import type { CanvasSummary } from '@/types/canvas'

const PAGE_SIZE = 24
const app = useAppStore()
const router = useRouter()
const items = ref<CanvasSummary[]>([])
const total = ref(0)
const totalStorageBytes = ref(0)
const pageIndex = ref(1)
const loading = ref(false)
const loadFailed = ref(false)
const creating = ref(false)

const hasMore = computed(() => items.value.length < total.value)
const subtitle = computed(() => app.t('canvas.listSubtitle').replace('{size}', formatStorageSize(totalStorageBytes.value)))

onMounted(() => void load())

async function load() {
  pageIndex.value = 1
  await fetchPage(false)
}

async function loadMore() {
  pageIndex.value += 1
  await fetchPage(true)
}

async function fetchPage(append: boolean) {
  loading.value = true
  loadFailed.value = false
  try {
    const result = await getCanvases({ pageIndex: pageIndex.value, pageSize: PAGE_SIZE })
    items.value = append ? [...items.value, ...result.items.filter((item) => !items.value.some((known) => known.canvasId === item.canvasId))] : result.items
    total.value = result.total
    totalStorageBytes.value = result.totalStorageBytes || 0
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function create() {
  if (creating.value) return
  creating.value = true
  try {
    const canvas = await createCanvas()
    await router.push({ name: 'canvas-editor', params: { canvasId: canvas.canvasId } })
  } catch (error) {
    const code = String((error as ApiError)?.code || '').toUpperCase()
    ElMessage.error(code === 'CANVAS_LIMIT_EXCEEDED' ? app.t('canvas.limitReached') : (error as ApiError)?.message || app.t('canvas.createFailed'))
  } finally {
    creating.value = false
  }
}

async function rename(item: CanvasSummary) {
  let title: string
  try {
    const result = await ElMessageBox.prompt(app.t('canvas.renamePrompt'), app.t('canvas.rename'), {
      inputValue: item.title,
      inputValidator: (value) => {
        const length = value.trim().length
        return (length >= 1 && length <= 100) || app.t('canvas.renameInvalid')
      },
      confirmButtonText: app.t('common.save'),
      cancelButtonText: app.t('common.cancel'),
    })
    title = result.value.trim()
  } catch {
    return
  }
  try {
    const updated = await renameCanvas(item.canvasId, title)
    item.title = updated.title
  } catch (error) {
    ElMessage.error((error as ApiError)?.message || app.t('canvas.renameFailed'))
  }
}

async function remove(item: CanvasSummary) {
  try {
    await ElMessageBox.confirm(app.t('canvas.deleteConfirm').replace('{title}', item.title), app.t('common.delete'), {
      type: 'warning',
      confirmButtonText: app.t('common.delete'),
      cancelButtonText: app.t('common.cancel'),
    })
  } catch {
    return
  }
  try {
    await deleteCanvas(item.canvasId)
    ElMessage.success(app.t('canvas.deleted'))
    await load()
  } catch (error) {
    ElMessage.error((error as ApiError)?.message || app.t('canvas.deleteFailed'))
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(app.locale)
}
</script>

<style scoped>
.canvas-list-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--space-lg) var(--space-lg) var(--space-2xl);
}

.canvas-list-header p {
  margin: 0 0 var(--space-lg);
  color: var(--color-text-muted);
}

.canvas-list-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: var(--space-md);
  color: var(--color-danger);
}

.canvas-grid {
  display: grid;
  min-height: 200px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-lg);
}

.canvas-create,
.canvas-cover {
  display: flex;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-text);
}

.canvas-create {
  font-size: 15px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.canvas-create:hover {
  background: var(--color-border);
}

.canvas-create .el-icon {
  font-size: 28px;
}

.canvas-cover-empty {
  color: var(--color-text-muted);
  font-size: 36px;
}

.canvas-card-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}

.canvas-card-hint {
  font-size: 13px;
}

.canvas-card-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.canvas-card-text strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-card-text span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.canvas-card-actions {
  display: flex;
  gap: 6px;
}

.canvas-card-actions button {
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 16px;
  cursor: pointer;
}

.canvas-card-actions button:hover {
  color: var(--color-text);
}

.canvas-list-more {
  display: flex;
  justify-content: center;
  margin-top: var(--space-lg);
}
</style>
