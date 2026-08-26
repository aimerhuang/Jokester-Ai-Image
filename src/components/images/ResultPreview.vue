<template>
  <section class="preview page-card">
    <h2>{{ title }}</h2>
    <div v-if="showTaskGrid" class="task-grid" :class="{ 'task-grid--single': taskSlots.length === 1 }" aria-live="polite">
      <article
        v-for="slot in taskSlots"
        :key="slot.key"
        class="task-card"
        :class="{
          'task-card--ready': Boolean(slot.displayUrl),
          'task-card--failed': slot.failed,
          'task-card--selected': slot.resultIndex === currentIndex,
        }"
      >
        <button
          v-if="slot.displayUrl"
          class="result-button"
          type="button"
          :aria-pressed="slot.resultIndex === currentIndex"
          @click="selectImage(slot.resultIndex)"
        >
          <img :src="slot.displayUrl" :alt="`Generated image ${slot.ordinal}`" />
        </button>
        <div v-else-if="slot.failed" class="task-state task-state--failed" role="status">
          <span class="failure-symbol" aria-hidden="true">!</span>
          <strong>{{ failedText }}</strong>
        </div>
        <div v-else class="task-state" role="status">
          <span class="loading-symbol" aria-hidden="true">&infin;</span>
          <strong class="progress-value">{{ displayedProgress }}%</strong>
          <span class="loading-label">{{ loadingText }}</span>
          <div class="progress-track" :aria-label="`${loadingText} ${displayedProgress}%`">
            <span class="progress-fill" :style="{ width: `${displayedProgress}%` }"></span>
          </div>
        </div>
      </article>
    </div>
    <EmptyState v-else :title="emptyTitle" :description="emptyDescription" />
    <div v-if="sourceImageUrls.length" class="actions"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useAuthenticatedImageUrls } from '@/composables/useAuthenticatedImageUrls'
import type { GeneratedImageBatchItem } from '@/types/image'

const props = defineProps<{
  title: string
  loadingText: string
  failedText: string
  emptyTitle: string
  emptyDescription: string
  imageUrl?: string
  imageUrls?: string[]
  items?: GeneratedImageBatchItem[]
  expectedCount?: number
  selectedIndex?: number
  progress?: number
  loading?: boolean
}>()
const emit = defineEmits<{ 'update:selectedIndex': [index: number] }>()

const orderedItems = computed(() => [...(props.items || [])].sort((left, right) => left.ordinal - right.ordinal))
const fallbackImageUrls = computed(() => {
  const urls = props.imageUrls?.filter(Boolean) || []
  return [...new Set(urls.length ? urls : props.imageUrl ? [props.imageUrl] : [])]
})
const slotCount = computed(() => Math.max(
  1,
  Math.min(4, Number(props.expectedCount) || 0),
  orderedItems.value.length,
  fallbackImageUrls.value.length,
))
const rawSlots = computed(() => Array.from({ length: slotCount.value }, (_, index) => {
  const item = orderedItems.value.find((candidate) => candidate.ordinal === index + 1) || orderedItems.value[index]
  const sourceUrl = String(item?.url || fallbackImageUrls.value[index] || '')
  const status = String(item?.status || '').toLowerCase()
  return {
    key: String(item?.taskId || `slot-${index + 1}`),
    ordinal: index + 1,
    sourceUrl,
    failed: status === 'failed' || status === 'cancelled',
  }
}))
const sourceImageUrls = computed(() => [...new Set(rawSlots.value.map((item) => item.sourceUrl).filter(Boolean))])
const { urls: displayImageUrls } = useAuthenticatedImageUrls(sourceImageUrls)
const displayUrlMap = computed(() => new Map(sourceImageUrls.value.map((url, index) => [url, displayImageUrls.value[index] || ''])))
const taskSlots = computed(() => {
  let resultIndex = 0
  return rawSlots.value.map((item) => {
    const slot = {
      ...item,
      displayUrl: item.sourceUrl ? displayUrlMap.value.get(item.sourceUrl) || '' : '',
      resultIndex: item.sourceUrl ? resultIndex : -1,
    }
    if (item.sourceUrl) resultIndex += 1
    return slot
  })
})
const showTaskGrid = computed(() => Boolean(
  props.loading
  || orderedItems.value.length
  || fallbackImageUrls.value.length,
))
const currentIndex = computed(() => Math.min(
  Math.max(props.selectedIndex || 0, 0),
  Math.max(sourceImageUrls.value.length - 1, 0),
))

const PROGRESS_DURATION = 60_000
const simulatedProgress = ref(1)
const displayedProgress = computed(() => {
  const rawProgress = Number(props.progress)
  if (Number.isFinite(rawProgress) && rawProgress > 0) {
    const percent = rawProgress <= 1 ? rawProgress * 100 : rawProgress
    return Math.min(99, Math.max(1, Math.round(percent)))
  }
  return simulatedProgress.value
})
let startedAt = 0
let timer: number | undefined

watch(() => props.loading, (loading) => {
  if (loading) startProgress()
  else stopProgress()
}, { immediate: true })

onUnmounted(stopProgress)

function selectImage(index: number) {
  if (index >= 0) emit('update:selectedIndex', index)
}

function startProgress() {
  stopProgress()
  startedAt = Date.now()
  simulatedProgress.value = 1
  timer = window.setInterval(updateProgress, 250)
  updateProgress()
}

function updateProgress() {
  const elapsed = Date.now() - startedAt
  const ratio = Math.min(elapsed / PROGRESS_DURATION, 1)
  simulatedProgress.value = Math.min(98, Math.max(1, Math.floor(1 + ratio * 97)))
}

function stopProgress() {
  if (timer) window.clearInterval(timer)
  timer = undefined
  if (!props.loading) simulatedProgress.value = 1
}
</script>

<style scoped>
.preview { min-height: 0; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
h2 { margin: 0; font-size: 22px; }
.preview > :deep(.empty-state) { flex: 1; }
.task-grid { flex: 1; min-height: 360px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-content: start; }
.task-grid--single { grid-template-columns: minmax(0, 1fr); }
.task-card { min-width: 0; aspect-ratio: 1; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-surface) 88%, var(--color-primary-soft)); }
.task-card--selected { border-color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 18%, transparent); }
.task-card--failed { border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border)); }
.result-button { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; }
.result-button:focus-visible { outline: 3px solid var(--color-primary); outline-offset: -3px; }
.result-button img { display: block; width: 100%; height: 100%; object-fit: contain; }
.task-state { width: 100%; height: 100%; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; color: var(--color-text); }
.loading-symbol { color: var(--color-primary); font-size: 54px; font-weight: 600; line-height: 0.75; animation: loading-pulse 1.6s ease-in-out infinite; }
.progress-value { font-size: 22px; line-height: 1; }
.loading-label { color: var(--color-text-muted); font-size: 13px; font-weight: 700; }
.progress-track { width: min(180px, 80%); height: 6px; margin-top: 6px; overflow: hidden; border-radius: 999px; background: var(--color-border); }
.progress-fill { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); transition: width 0.25s ease; }
.task-state--failed { color: var(--color-danger); }
.failure-symbol { width: 36px; height: 36px; display: grid; place-items: center; border: 2px solid currentColor; border-radius: 50%; font-size: 20px; font-weight: 800; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
@keyframes loading-pulse { 50% { opacity: 0.55; transform: scale(1.06); } }
@media (max-width: 680px) { .task-grid { grid-template-columns: 1fr; } .task-card { aspect-ratio: 4 / 3; } }
</style>
