<template>
  <div class="reference-uploader" tabindex="0" @paste="handlePaste">
    <input
      ref="inputRef"
      class="file-input"
      type="file"
      accept="image/webp,image/jpeg,image/png"
      multiple
      @change="handleInputChange"
    />

    <div
      v-if="!items.length"
      class="empty-dropzone"
      role="button"
      @click="openFileDialog"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="handleDrop"
      :class="{ dragging }"
    >
      <el-icon class="upload-icon"><Plus /></el-icon>
      <div>{{ app.t('referenceUploader.dropTitle') }}</div>
      <div class="hint">{{ app.t('referenceUploader.dropHint') }}</div>
    </div>

    <div v-else class="preview-grid">
      <div v-for="item in items" :key="item.id" class="preview-card">
        <el-image
          class="preview-image"
          :src="item.previewUrl"
          :preview-src-list="[item.previewUrl]"
          fit="cover"
          preview-teleported
          hide-on-click-modal
        />
        <div v-if="item.uploading" class="uploading-mask">{{ app.t('referenceUploader.uploading') }}</div>
        <button
          class="remove-button"
          type="button"
          :aria-label="app.t('referenceUploader.removeImage')"
          @click.stop="removeItem(item.id)"
        >
          ×
        </button>
      </div>
      <button
        v-if="items.length < maxCount"
        class="add-card"
        type="button"
        @click="openFileDialog"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="handleDrop"
        :class="{ dragging }"
      >
        <el-icon><Plus /></el-icon>
        <span>{{ app.t('referenceUploader.addImage') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { uploadReferenceImage } from '@/services/aiImages'
import { useAppStore } from '@/stores/app'
import { resolveMediaUrl } from '@/utils/authenticatedMedia'
import type { ApiError } from '@/types/api'

interface ReferenceImageItem {
  id: number
  file?: File
  previewUrl: string
  url: string
  assetId: string
  uploading: boolean
}

const props = withDefaults(defineProps<{ initialUrls?: string[] }>(), { initialUrls: () => [] })
const emit = defineEmits<{
  change: [urls: string[]]
  'asset-ids-change': [assetIds: string[]]
  'uploading-change': [uploading: boolean]
}>()
const maxCount = 6
const maxSize = 10 * 1024 * 1024
const allowedTypes = ['image/webp', 'image/jpeg', 'image/png']
const inputRef = ref<HTMLInputElement>()
const items = ref<ReferenceImageItem[]>([])
const dragging = ref(false)
const uploading = computed(() => items.value.some((item) => item.uploading))
const app = useAppStore()
let nextId = 1

watch(uploading, (value) => emit('uploading-change', value), { immediate: true })
watch(
  () => props.initialUrls,
  (urls) => {
    const incoming = urls.filter((url) => url && !items.value.some((item) => item.url === url))
    if (!incoming.length) return
    void addInitialUrls(incoming)
  },
  { immediate: true },
)

async function addInitialUrls(urls: string[]) {
  const resolved = await Promise.all(urls.map(async (url) => {
    try {
      const media = await resolveMediaUrl(url)
      return { id: nextId++, previewUrl: media.url, url, assetId: '', uploading: false }
    } catch {
      return { id: nextId++, previewUrl: '', url, assetId: '', uploading: false }
    }
  }))
  items.value.push(...resolved)
  emitUrls()
}

function openFileDialog() {
  inputRef.value?.click()
}

async function handleInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  await addFiles(Array.from(target.files || []))
  target.value = ''
}

function handleDrop(event: DragEvent) {
  dragging.value = false
  addFiles(Array.from(event.dataTransfer?.files || []))
}

function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  addFiles(files)
}

async function addFiles(files: File[]) {
  for (const file of files) {
    if (items.value.length >= maxCount) {
      ElMessage.warning(app.t('referenceUploader.maxCountWarning'))
      break
    }

    if (!allowedTypes.includes(file.type)) {
      ElMessage.warning(app.t('referenceUploader.typeWarning'))
      continue
    }

    if (file.size > maxSize) {
      ElMessage.warning(app.t('referenceUploader.maxSizeWarning'))
      continue
    }

    const item: ReferenceImageItem = {
      id: nextId++,
      file,
      previewUrl: URL.createObjectURL(file),
      url: '',
      assetId: '',
      uploading: true,
    }
    items.value.push(item)
    uploadItem(item)
  }

  emitUrls()
}

async function uploadItem(item: ReferenceImageItem) {
  if (!item.file) return
  let shouldRemove = false

  try {
    const result = await uploadReferenceImage(item.file)
    const current = items.value.find((value) => value.id === item.id)
    if (current) {
      current.assetId = result.assetId
      current.url = result.url
    }
  } catch (error) {
    ElMessage.error((error as ApiError).message || app.t('referenceUploader.uploadFailed'))
    shouldRemove = true
  } finally {
    const current = items.value.find((value) => value.id === item.id)
    if (current) current.uploading = false
  }

  if (shouldRemove) {
    removeItem(item.id)
    return
  }

  emitUrls()
}

function removeItem(id: number) {
  const item = items.value.find((value) => value.id === id)
  if (item?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
  items.value = items.value.filter((value) => value.id !== id)
  emitUrls()
}

function emitUrls() {
  emit('change', items.value.filter((item) => !item.assetId).map((item) => item.url).filter(Boolean))
  emit('asset-ids-change', items.value.map((item) => item.assetId).filter(Boolean))
}

onBeforeUnmount(() => {
  items.value.forEach((item) => {
    if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
  })
})
</script>

<style scoped>
.reference-uploader { display: block; width: 100%; outline: none; }
.file-input { display: none; }
.empty-dropzone {
  width: 100%;
  min-height: 150px;
  box-sizing: border-box;
  padding: 18px;
  border: 1px dashed var(--el-border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  text-align: center;
  transition: border-color .2s, background-color .2s, color .2s;
}
.empty-dropzone:hover,
.empty-dropzone.dragging,
.add-card.dragging {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.upload-icon { font-size: 28px; }
.hint { font-size: 12px; color: var(--el-text-color-placeholder); }
.preview-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 12px;
}
.preview-card,
.add-card {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-fill-color-lighter);
}
.preview-image {
  width: 100%;
  height: 100%;
  display: block;
}
.preview-image :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.reference-uploader :global(.el-image-viewer__img) {
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
}
.uploading-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 45%);
  color: #fff;
  font-size: 12px;
}
.remove-button {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 1;
  transition: background-color .18s ease, color .18s ease, transform .18s ease;
}
.remove-button:hover {
  background: rgb(255 255 255 / 92%);
  color: var(--el-color-danger);
}
.add-card {
  border-style: dashed;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.add-card:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
</style>
