<template>
  <section class="preview page-card">
    <h2>{{ title }}</h2>
    <div v-if="displayLoading" class="loading-box" role="status" aria-live="polite">
      <div class="loading-card">
        <div class="orb-wrap" aria-hidden="true">
          <span class="orb orb-primary"></span>
          <span class="orb orb-secondary"></span>
          <span class="orb-glow"></span>
        </div>
        <strong class="progress-value">{{ progress }}%</strong>
        <span class="loading-label">{{ loadingText }}</span>
        <div class="progress-track" :aria-label="`${loadingText} ${progress}%`">
          <span class="progress-fill" :style="{ width: `${progress}%` }"></span>
        </div>
      </div>
    </div>
    <img v-else-if="imageUrl" :src="imageUrl" alt="Generated image" />
    <EmptyState v-else :title="emptyTitle" :description="emptyDescription" />
    <div v-if="imageUrl" class="actions"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'

const props = defineProps<{ title: string; loadingText: string; emptyTitle: string; emptyDescription: string; imageUrl?: string; loading?: boolean }>()

const PROGRESS_DURATION = 60_000
const progress = ref(1)
const displayLoading = computed(() => props.loading || progress.value === 100)
let startedAt = 0
let timer: number | undefined

watch(() => props.loading, (loading) => {
  if (loading) {
    startProgress()
  } else {
    stopProgress()
    if (props.imageUrl) {
      progress.value = 100
      window.setTimeout(() => {
        if (!props.loading) progress.value = 1
      }, 450)
    } else {
      progress.value = 1
    }
  }
}, { immediate: true })

onUnmounted(stopProgress)

function startProgress() {
  stopProgress()
  startedAt = Date.now()
  progress.value = 1
  timer = window.setInterval(updateProgress, 250)
  updateProgress()
}

function updateProgress() {
  const elapsed = Date.now() - startedAt
  const ratio = Math.min(elapsed / PROGRESS_DURATION, 1)
  progress.value = Math.min(98, Math.max(1, Math.floor(1 + ratio * 97)))
}

function stopProgress() {
  if (timer) {
    window.clearInterval(timer)
    timer = undefined
  }
}
</script>

<style scoped>
.preview { padding: 24px; min-height: 560px; display: flex; flex-direction: column; gap: 18px; }
h2 { margin: 0; font-size: 22px; }
img { width: 100%; max-height: 680px; object-fit: contain; border-radius: var(--radius-lg); background: var(--color-primary-soft); }
.loading-box {
  flex: 1;
  min-height: 360px;
  display: grid;
  place-items: center;
  padding: 28px;
  border-radius: var(--radius-xl);
  background:
    radial-gradient(circle at 24% 18%, rgba(111, 127, 63, 0.14), transparent 28%),
    linear-gradient(135deg, rgba(232, 238, 220, 0.78), rgba(255, 255, 255, 0.92) 48%, rgba(232, 238, 220, 0.72));
  color: var(--color-text);
}
.loading-card {
  position: relative;
  width: min(100%, 360px);
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 36px;
  overflow: hidden;
  border: 1px solid rgba(226, 229, 216, 0.8);
  border-radius: var(--radius-xl);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 18px 54px rgba(35, 37, 31, 0.08);
  backdrop-filter: blur(12px);
}
.loading-card::before {
  content: '';
  position: absolute;
  inset: -40%;
  background: conic-gradient(from 180deg, transparent, rgba(111, 127, 63, 0.12), transparent, rgba(168, 185, 120, 0.16), transparent);
  animation: rotate 7s linear infinite;
}
.loading-card > * { position: relative; z-index: 1; }
.orb-wrap { position: relative; width: 84px; height: 52px; margin-bottom: 4px; }
.orb {
  position: absolute;
  top: 12px;
  width: 38px;
  height: 28px;
  border: 4px solid transparent;
  border-radius: 50%;
  filter: drop-shadow(0 8px 16px rgba(111, 127, 63, 0.16));
}
.orb-primary {
  left: 8px;
  border-color: #94b95f #94b95f #94b95f transparent;
  transform: rotate(-24deg);
  animation: pulse-left 1.8s ease-in-out infinite;
}
.orb-secondary {
  right: 8px;
  border-color: #b8c39a transparent #b8c39a #b8c39a;
  transform: rotate(24deg);
  animation: pulse-right 1.8s ease-in-out infinite;
}
.orb-glow {
  position: absolute;
  inset: 10px 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(111, 127, 63, 0.18), rgba(168, 185, 120, 0.22));
  filter: blur(14px);
}
.progress-value { font-size: 28px; line-height: 1; letter-spacing: -0.02em; }
.loading-label { color: var(--color-text-muted); font-weight: 700; }
.progress-track {
  width: 100%;
  height: 10px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(226, 229, 216, 0.88);
}
.progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-primary), #a8b978, #d4dcc5);
  box-shadow: 0 0 18px rgba(111, 127, 63, 0.34);
  transition: width 0.25s ease;
}
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
html.dark .loading-box {
  background:
    radial-gradient(circle at 24% 18%, rgba(168, 185, 120, 0.18), transparent 28%),
    linear-gradient(135deg, rgba(47, 56, 32, 0.74), rgba(32, 35, 25, 0.92) 48%, rgba(47, 56, 32, 0.72));
}
html.dark .loading-card { border-color: rgba(52, 58, 41, 0.9); background: rgba(32, 35, 25, 0.78); box-shadow: 0 18px 54px rgba(0, 0, 0, 0.22); }
html.dark .progress-track { background: rgba(52, 58, 41, 0.9); }
@keyframes rotate { to { transform: rotate(1turn); } }
@keyframes pulse-left { 50% { transform: rotate(-24deg) scale(1.08); } }
@keyframes pulse-right { 50% { transform: rotate(24deg) scale(1.08); } }
</style>
