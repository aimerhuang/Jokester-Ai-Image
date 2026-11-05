<template>
  <aside class="gallery-drawer" @pointerdown.stop @wheel.stop>
    <header class="gallery-header">
      <strong>{{ app.t('canvas.gallery') }}</strong>
      <button type="button" class="icon-button" :aria-label="app.t('common.cancel')" @click="emit('close')">
        <el-icon><DArrowLeft /></el-icon>
      </button>
    </header>
    <div class="gallery-tabs" role="tablist">
      <button type="button" role="tab" :class="{ active: tab === 'workbench' }" @click="tab = 'workbench'">{{ app.t('canvas.galleryWorkbench') }}</button>
      <button type="button" role="tab" :class="{ active: tab === 'canvas' }" @click="tab = 'canvas'">{{ app.t('canvas.galleryCanvas') }}</button>
    </div>

    <template v-if="tab === 'workbench'">
      <div class="gallery-meta">
        <span>{{ app.t('canvas.galleryMaterials') }}</span>
        <span>{{ countText }}</span>
      </div>
      <div class="gallery-list">
        <div
          v-for="item in entries"
          :key="`${item.taskId}-${item.resultOrdinal}`"
          class="gallery-item"
          draggable="true"
          :title="item.prompt"
          @dragstart="handleDragStart($event, item)"
          @click="emit('insert', item)"
        >
          <div class="gallery-thumb"><CanvasAuthImage :src="item.url" :alt="item.prompt" /></div>
          <div class="gallery-text">
            <strong>{{ item.prompt || '—' }}</strong>
            <span>{{ item.meta }}</span>
          </div>
        </div>
        <p v-if="!loading && !entries.length" class="gallery-empty">{{ loadFailed ? app.t('canvas.galleryLoadFailed') : app.t('canvas.galleryEmpty') }}</p>
        <el-button v-if="hasMore || loadFailed" class="gallery-more" text :loading="loading" @click="loadPage">
          {{ loadFailed ? app.t('common.retry') : app.t('canvas.loadMore') }}
        </el-button>
      </div>
    </template>

    <div v-else class="gallery-list">
      <button v-for="item in canvasResults" :key="item.nodeId" type="button" class="gallery-item" @click="emit('focus', item.nodeId)">
        <div class="gallery-thumb"><CanvasAuthImage :src="assetThumbnailUrl(item.assetId)" :alt="item.title" /></div>
        <div class="gallery-text">
          <strong>{{ item.title }}</strong>
          <span>#{{ item.taskId }}</span>
        </div>
      </button>
      <p v-if="!canvasResults.length" class="gallery-empty">{{ app.t('canvas.galleryCanvasEmpty') }}</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DArrowLeft } from '@element-plus/icons-vue'
import CanvasAuthImage from './CanvasAuthImage.vue'
import { getImageRecords } from '@/services/aiImages'
import { assetThumbnailUrl } from '@/services/canvases'
import { useAppStore } from '@/stores/app'
import { GALLERY_DRAG_TYPE } from '@/utils/canvasDocument'
import type { CanvasDocument, CanvasGalleryEntry } from '@/types/canvas'
import type { ImageRecord } from '@/types/image'

const PAGE_SIZE = 20

const props = defineProps<{ document: CanvasDocument }>()
const emit = defineEmits<{
  close: []
  insert: [entry: CanvasGalleryEntry]
  focus: [nodeId: string]
}>()

const app = useAppStore()
const tab = ref<'workbench' | 'canvas'>('workbench')
const records = ref<ImageRecord[]>([])
const total = ref(0)
const pageIndex = ref(0)
const loading = ref(false)
const loadFailed = ref(false)

const entries = computed<CanvasGalleryEntry[]>(() => records.value.flatMap((record) => readUrls(record.resultUrls).map((url, resultOrdinal) => ({
  taskId: Number(record.taskId || record.id),
  resultOrdinal,
  url,
  prompt: record.prompt,
  meta: [record.modelName, record.resolutionCode, record.aspectRatioCode?.replace(':', 'x')].filter(Boolean).join('-'),
  width: record.outputWidth || record.width,
  height: record.outputHeight || record.height,
}))))
const hasMore = computed(() => records.value.length < total.value)
const countText = computed(() => app.t('canvas.galleryCount')
  .replace('{loaded}', String(records.value.length))
  .replace('{total}', String(total.value)))
const canvasResults = computed(() => props.document.nodes.flatMap((node) => {
  if (node.type === 'image' && node.data.sourceTaskId) {
    return [{ nodeId: node.id, assetId: node.data.assetId, taskId: node.data.sourceTaskId, title: node.title || app.t('canvas.imageNode') }]
  }
  if (node.type === 'generate' && node.data.primaryResult?.assetId) {
    return [{ nodeId: node.id, assetId: node.data.primaryResult.assetId, taskId: node.data.primaryResult.taskId, title: node.data.prompt?.trim() || app.t('canvas.newGenerate') }]
  }
  return []
}).sort((left, right) => right.taskId - left.taskId))

onMounted(() => void loadPage())

async function loadPage() {
  if (loading.value) return
  loading.value = true
  loadFailed.value = false
  try {
    const next = pageIndex.value + 1
    const result = await getImageRecords({ pageIndex: next, pageSize: PAGE_SIZE, status: 1 })
    const known = new Set(records.value.map((item) => item.id))
    records.value = [...records.value, ...result.items.filter((item) => !known.has(item.id))]
    total.value = result.total
    pageIndex.value = next
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

function handleDragStart(event: DragEvent, entry: CanvasGalleryEntry) {
  event.dataTransfer?.setData(GALLERY_DRAG_TYPE, JSON.stringify(entry))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function readUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item))
  if (typeof value === 'string' && value.trim()) {
    try {
      return readUrls(JSON.parse(value))
    } catch {
      return [value]
    }
  }
  return []
}
</script>

<style scoped>
.gallery-drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: flex;
  width: 280px;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: default;
}

.gallery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
}

.icon-button {
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.gallery-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--color-border);
}

.gallery-tabs button {
  padding: 10px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.gallery-tabs button.active {
  border-bottom-color: var(--canvas-accent);
  color: var(--canvas-accent);
  font-weight: 600;
}

.gallery-meta {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.gallery-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 16px;
}

.gallery-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.gallery-item:hover {
  background: var(--color-primary-soft);
}

.gallery-thumb {
  width: 40px;
  height: 40px;
  flex: none;
  overflow: hidden;
  border-radius: 6px;
}

.gallery-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.gallery-text strong,
.gallery-text span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-text strong {
  font-size: 13px;
}

.gallery-text span {
  color: var(--color-text-muted);
  font-size: 11px;
}

.gallery-empty {
  padding: 24px 8px;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}

.gallery-more {
  width: 100%;
}
</style>
