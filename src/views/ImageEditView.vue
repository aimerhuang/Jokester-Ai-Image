<template>
  <div class="detail-page">
    <el-skeleton v-if="loading" :rows="10" animated />
    <section v-else-if="errorMessage" class="visual-panel page-card error-panel">
      <EmptyState title="详情加载失败" :description="errorMessage">
        <el-button type="primary" @click="router.push('/images')">返回画廊</el-button>
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
              <div class="image-error">图片加载失败</div>
            </template>
          </el-image>
          <div v-if="imageUrls.length > 1" class="thumbnail-strip" role="list" aria-label="Generated images">
            <button
              v-for="(url, index) in imageUrls"
              :key="url"
              class="thumbnail-button"
              :class="{ active: url === imageUrl }"
              type="button"
              role="listitem"
              @click="selectedUrl = url"
            >
              <img :src="url" :alt="`Generated image ${index + 1}`" @error="hideBrokenThumbnail" />
              <span>{{ index + 1 }}</span>
            </button>
          </div>
        </div>
        <EmptyState v-else :title="app.t('playground.emptyTitle')" :description="app.t('playground.emptyDescription')" />
      </section>

      <aside class="control-panel page-card">
        <section>
          <h3>{{ app.t('imageDetail.prompt') }}</h3>
          <el-input v-model="prompt" type="textarea" :rows="6" />
        </section>

        <section>
          <h3>{{ app.t('imageDetail.parameters') }}</h3>
          <div class="params-grid">
            <span>{{ app.t('playground.model') }}</span><strong>{{ record?.modelName || '-' }}</strong>
            <span>{{ app.t('playground.resolution') }}</span><strong>{{ record?.resolutionCode || '-' }}</strong>
            <span>{{ app.t('playground.quality') }}</span><strong>{{ record?.qualityCode || '-' }}</strong>
            <span>{{ app.t('playground.aspectRatio') }}</span><strong>{{ record?.aspectRatioCode || '-' }}</strong>
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
          <el-button type="primary" class="soft-button" @click="reuseConfig">{{ app.t('imageDetail.editImage') }}</el-button>
          <el-button @click="reuseConfig">{{ app.t('imageDetail.reuseConfig') }}</el-button>
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
import { favoriteImageRecord, getImageRecord } from '@/services/aiImages'
import { useAppStore } from '@/stores/app'
import { downloadImage, getImageUrls, saveReuseConfig } from '@/utils/imageActions'
import type { ApiError } from '@/types/api'
import type { ImageRecord } from '@/types/image'

const app = useAppStore()
const route = useRoute()
const router = useRouter()
const record = ref<ImageRecord | null>(null)
const prompt = ref('')
const loading = ref(false)
const errorMessage = ref('')
const selectedUrl = ref('')
const imageUrls = computed(() => getImageUrls(record.value))
const imageUrl = computed(() => selectedUrl.value || imageUrls.value[0] || '')
const selectedIndex = computed(() => Math.max(0, imageUrls.value.indexOf(imageUrl.value)))
const referenceImages = computed(() => record.value?.referenceImageUrls || [])
const favorite = computed(() => record.value ? Boolean(record.value.favorite || record.value.isFavorite) : false)

onMounted(async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const detail = await getImageRecord(String(route.params.id))
    record.value = detail
    prompt.value = detail.prompt || ''
    selectInitialImage()
  } catch (error) {
    errorMessage.value = (error as ApiError).message || '图片详情加载失败，请返回画廊重试。'
  } finally {
    loading.value = false
  }
})

function selectInitialImage() {
  const urls = imageUrls.value
  const queryUrl = typeof route.query.url === 'string' ? route.query.url : ''
  selectedUrl.value = (queryUrl && urls.includes(queryUrl)) ? queryUrl : urls[0] || queryUrl || ''
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
  downloadImage(imageUrl.value, `image-${record.value?.id || globalThis.crypto?.randomUUID?.() || 'generated'}.png`)
}

async function toggleFavorite() {
  if (!record.value) return
  const currentRecord = record.value
  const id = currentRecord.id || currentRecord.taskId
  if (!id) return ElMessage.warning(app.t('gallery.missingImageId'))
  const url = imageUrl.value
  if (!url) return ElMessage.warning(app.t('gallery.missingImageUrl'))

  const next = !Boolean(currentRecord.favorite || currentRecord.isFavorite)
  currentRecord.favorite = next
  currentRecord.isFavorite = next

  try {
    const updated = await favoriteImageRecord(id, { imageUrl: url, isFavorite: next })
    if (updated && typeof updated === 'object') {
      const serverFavorite = updated.isFavorite ?? updated.favorite
      if (typeof serverFavorite === 'boolean') {
        currentRecord.favorite = serverFavorite
        currentRecord.isFavorite = serverFavorite
      }
    }
    ElMessage.success((currentRecord.favorite || currentRecord.isFavorite) ? app.t('gallery.favoriteAdded') : app.t('gallery.favoriteRemoved'))
  } catch (error) {
    currentRecord.favorite = !next
    currentRecord.isFavorite = !next
    ElMessage.error((error as ApiError).message)
  }
}

function currentConfig() {
  if (!record.value) return null
  return {
    prompt: prompt.value,
    modelName: record.value.modelName,
    resolutionCode: record.value.resolutionCode,
    qualityCode: record.value.qualityCode,
    aspectRatioCode: record.value.aspectRatioCode,
    referenceImageUrls: record.value.referenceImageUrls || [],
  }
}

function reuseConfig() {
  const config = currentConfig()
  if (!config) return
  saveReuseConfig(config)
  router.push('/playground')
}

async function usePrompt() {
  await copyPrompt()
  router.push({ path: '/playground', query: { prompt: prompt.value } })
}

function useAsReference() {
  const url = imageUrl.value
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
