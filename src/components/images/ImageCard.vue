<template>
  <article class="image-card page-card" @click="$emit('preview', record)">
    <div class="image-shell">
      <img v-if="imageUrl" :src="imageUrl" alt="Generated image" />
      <div v-else class="placeholder">
        <strong>{{ taskStatusText }}</strong>
      </div>

      <div class="hover-layer">
        <div class="top-actions">
          <el-button
            v-if="imageUrl"
            class="circle-action favorite-action"
            :class="{ 'is-favorite': favorite }"
            circle
            :title="favorite ? app.t('gallery.unfavorite') : app.t('gallery.favorite')"
            @click.stop="$emit('favorite', record)"
          >
            <span class="favorite-icon" aria-hidden="true" />
          </el-button>
          <el-button class="circle-action danger" circle :title="app.t('common.delete')" @click.stop="$emit('delete', record)">
            <span class="delete-icon" aria-hidden="true" />
          </el-button>
        </div>
        <div class="bottom-meta">
          <span class="date">{{ createdDate }}</span>
          <div v-if="imageUrl" class="quick-actions">
            <el-button class="circle-action" circle :title="app.t('gallery.fullscreen')" @click.stop="$emit('fullscreen', imageUrl)">
              <span class="fullscreen-icon" aria-hidden="true" />
            </el-button>
            <el-button class="circle-action" circle :title="app.t('common.download')" @click.stop="download">
              <span class="download-icon" aria-hidden="true" />
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <div class="image-card__body">
      <strong>{{ shortPrompt }}</strong>
      <span>{{ meta }}</span>
      <div v-if="record.pointCost !== undefined || record.billingStatus !== undefined" class="billing-meta">
        <span>{{ app.t('gallery.pointCost') }}: {{ record.pointCost ?? '-' }}</span>
        <span>{{ billingStatusText }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthenticatedImageUrl } from '@/composables/useAuthenticatedImageUrls'
import { useAppStore } from '@/stores/app'
import { downloadImage, formatImageDate, getImageUrl, truncatePrompt } from '@/utils/imageActions'
import type { ImageRecord } from '@/types/image'

const props = defineProps<{ record: ImageRecord; imageSourceUrl?: string; favorite?: boolean }>()
defineEmits<{
  preview: [record: ImageRecord]
  delete: [record: ImageRecord]
  favorite: [record: ImageRecord]
  fullscreen: [url: string]
}>()

const app = useAppStore()
const sourceImageUrl = computed(() => props.imageSourceUrl || getImageUrl(props.record))
const { url: imageUrl } = useAuthenticatedImageUrl(sourceImageUrl)
const meta = computed(() => [
  props.record.modelCode || props.record.modelName || '-',
  taskSizeText.value,
  props.record.qualityCode || '-',
].join(' / '))
const taskSizeText = computed(() => {
  if (props.record.sizeContractVersion === 'size-mode-v1' && props.record.sizeMode === 'auto') {
    if (isPositiveDimension(props.record.outputWidth) && isPositiveDimension(props.record.outputHeight)) {
      return `${props.record.outputWidth}x${props.record.outputHeight}`
    }
    return app.t('gallery.autoSizeWaiting')
  }
  return props.record.requestedResolutionCode
    || props.record.resolutionCode
    || props.record.requestedSize
    || app.t('gallery.actualSizeUnknown')
})
const shortPrompt = computed(() => truncatePrompt(props.record.prompt, 20))
const createdDate = computed(() => formatImageDate(props.record.createdAt))
const taskStatusText = computed(() => {
  const status = String(props.record.status ?? props.record.statusCode ?? '').trim().toLowerCase()
  if (status === 'queued') return app.t('gallery.taskQueued')
  if (status === 'processing' || status === '0' || status === '3') return app.t('gallery.taskProcessing')
  if (status === 'failed' || status === '2') return app.t('gallery.taskFailed')
  if (status === 'cancelled') return app.t('gallery.taskCancelled')
  return app.t('gallery.taskPending')
})
const billingStatusText = computed(() => {
  const keys: Record<number, string> = {
    0: 'gallery.billingReserved',
    1: 'gallery.billingConfirmed',
    2: 'gallery.billingPartialRefund',
    3: 'gallery.billingFullRefundSettled',
  }
  const key = keys[Number(props.record.billingStatus)]
  return key ? app.t(key) : app.t('gallery.billingUnknown')
})

function download() {
  downloadImage(sourceImageUrl.value, `image-${props.record.id || globalThis.crypto?.randomUUID?.() || 'generated'}.png`)
}

function isPositiveDimension(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
</script>

<style scoped>
.image-card { overflow: hidden; transition: .18s ease; cursor: pointer; }
.image-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-card-hover); }
.image-shell { position: relative; overflow: hidden; background: var(--color-primary-soft); }
img, .placeholder { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: var(--color-primary-soft); }
.placeholder { display: grid; place-items: center; padding: 18px; color: var(--color-text-muted); text-align: center; }
.placeholder strong { white-space: normal; }
.hover-layer {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  opacity: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgb(35 37 31 / 44%), transparent 36%, rgb(35 37 31 / 52%)),
    linear-gradient(135deg, rgb(111 127 63 / 12%), transparent 48%);
  transition: opacity .18s ease;
}
.image-card:hover .hover-layer { opacity: 1; pointer-events: auto; }
.top-actions, .quick-actions { display: flex; gap: 8px; }
.top-actions { justify-content: flex-end; }
.top-actions .circle-action { width: 32px; height: 32px; }
.bottom-meta { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
.date {
  padding: 5px 10px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 999px;
  background: rgb(35 37 31 / 46%);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(10px);
}
.circle-action {
  --action-bg: rgb(255 255 255 / 86%);
  --action-fg: var(--color-primary);
  --action-hover-bg: var(--color-primary);
  --action-hover-fg: #fff;
  --el-button-bg-color: var(--action-bg);
  --el-button-border-color: rgb(255 255 255 / 42%);
  --el-button-hover-bg-color: var(--action-hover-bg);
  --el-button-hover-border-color: rgb(255 255 255 / 58%);
  --el-button-hover-text-color: var(--action-hover-fg);
  --el-button-active-bg-color: var(--color-primary-hover);
  --el-button-active-border-color: rgb(255 255 255 / 60%);
  --el-button-active-text-color: #fff;
  --el-button-text-color: var(--action-fg);
  width: 36px;
  height: 36px;
  border: 1px solid rgb(255 255 255 / 42%);
  background: var(--action-bg);
  color: var(--action-fg);
  box-shadow: 0 10px 24px rgb(35 37 31 / 18%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  backdrop-filter: blur(12px) saturate(1.15);
  transform: translateY(4px) scale(.96);
  transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease, color .18s ease, transform .18s ease;
}
.image-card:hover .circle-action { transform: translateY(0) scale(1); }
.circle-action:hover, .circle-action:focus {
  background: var(--action-hover-bg);
  color: var(--action-hover-fg);
  box-shadow: var(--shadow-primary);
  transform: translateY(-1px) scale(1.04);
}
.circle-action.danger {
  --action-fg: var(--color-danger);
  --action-hover-bg: var(--color-danger);
}
.favorite-action.is-favorite {
  --action-bg: color-mix(in srgb, var(--color-danger) 14%, white);
  --action-fg: var(--color-danger);
  --action-hover-bg: var(--color-danger);
}
.favorite-icon, .delete-icon, .fullscreen-icon, .download-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  color: currentColor;
  opacity: 1;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
}
.favorite-icon::before { content: "\2661"; }
.favorite-action:hover .favorite-icon::before, .favorite-action:focus .favorite-icon::before, .favorite-action.is-favorite .favorite-icon::before { content: "\2665"; }
.delete-icon { font-size: 23px; font-weight: 400; transform: translateY(-1px); }
.delete-icon::before { content: "\00d7"; }
.fullscreen-icon::before { content: "\26f6"; }
.download-icon::before { content: "\2193"; }
.image-card__body { padding: 14px; display: grid; gap: 8px; }
.billing-meta { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border); }
.billing-meta span:last-child { text-align: right; }
strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
span { color: var(--color-text-muted); font-size: 13px; }
</style>
