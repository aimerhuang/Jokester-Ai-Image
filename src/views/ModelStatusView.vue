<template>
  <div class="model-status-page">
    <div class="status-toolbar">
      <span v-if="status" class="updated-at" :class="{ stale: isStale }" data-testid="model-status-updated">
        {{ updatedAtText }}<template v-if="isStale"> · {{ app.t('modelStatus.stale') }}</template>
      </span>
      <el-button class="soft-button refresh-button" :loading="loading" :disabled="refreshCooldown" data-testid="model-status-refresh" @click="manualRefresh">
        <el-icon><Refresh /></el-icon>
        <span>{{ app.t('modelStatus.refresh') }}</span>
      </el-button>
    </div>

    <div v-if="!status && loading" v-loading="true" class="status-loading page-card" />

    <div v-else-if="!status && loadError" class="status-state page-card">
      <p>{{ app.t('modelStatus.loadFailed') }}</p>
      <el-button type="primary" class="soft-button" @click="load()">{{ app.t('modelStatus.retry') }}</el-button>
    </div>

    <el-empty v-else-if="status && !status.items.length" :description="app.t('modelStatus.empty')" />

    <div v-else-if="status" class="status-grid">
      <article v-for="item in status.items" :key="item.modelCode" class="status-card page-card" :class="`is-${item.state}`" :data-model-code="item.modelCode">
        <header class="card-head">
          <span class="pulse-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
          </span>
          <div class="card-title">
            <h2 :title="item.modelName">{{ item.modelName }} <small v-if="item.vipOnly">VIP</small></h2>
            <p>{{ app.t(`modelStatus.${descriptionKey(item.state)}`) }}</p>
          </div>
          <ModelStatusBadge :state="item.state" />
        </header>

        <div class="availability-row">
          <span>{{ app.t('modelStatus.availability') }}</span>
          <strong class="availability-value" data-testid="model-availability">{{ formatPercent(item.availability) }}</strong>
        </div>

        <div class="latency-grid">
          <div class="latency-box">
            <span>{{ app.t('modelStatus.fastestSuccess') }}</span>
            <strong>{{ formatSeconds(item.fastestSuccessSeconds) }}</strong>
          </div>
          <div class="latency-box">
            <span>{{ app.t('modelStatus.slowestSuccess') }}</span>
            <strong>{{ formatSeconds(item.slowestSuccessSeconds) }}</strong>
          </div>
        </div>

        <div class="recent-block">
          <span class="recent-title">{{ app.t('modelStatus.recentRequests').replace('{count}', String(status.sampleLimit)) }}</span>
          <div class="recent-bars" :class="{ empty: !item.recent.length }" data-testid="model-recent-bars">
            <span
              v-for="(result, index) in item.recent"
              :key="index"
              class="recent-bar"
              :class="result === 1 ? 'success' : 'failure'"
              :title="barTitle(item, index)"
            />
          </div>
          <div class="recent-axis">
            <span>{{ app.t('modelStatus.past') }}</span>
            <span>{{ app.t('modelStatus.now') }}</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import ModelStatusBadge from '@/components/models/ModelStatusBadge.vue'
import { getModelStatus } from '@/services/models'
import { useAppStore } from '@/stores/app'
import type { ModelStatusItem, ModelStatusResponse, ModelStatusState } from '@/types/models'

const AUTO_REFRESH_MS = 60_000
const REFRESH_COOLDOWN_MS = 5_000
const STALE_AFTER_MS = 5 * 60_000

const app = useAppStore()
const status = ref<ModelStatusResponse | null>(null)
const loading = ref(false)
const loadError = ref(false)
const refreshCooldown = ref(false)
const now = ref(Date.now())
let refreshTimer: number | undefined
let cooldownTimer: number | undefined

const isStale = computed(() => Boolean(status.value) && now.value - dayjs(status.value!.generatedAt).valueOf() > STALE_AFTER_MS)
const updatedAtText = computed(() => status.value
  ? app.t('modelStatus.updatedAt').replace('{time}', dayjs(status.value.generatedAt).format('HH:mm:ss'))
  : '')

async function load(options: { quiet?: boolean } = {}) {
  if (loading.value) return
  loading.value = true
  try {
    status.value = await getModelStatus()
    loadError.value = false
  } catch {
    // Keep the previous snapshot on screen; only the first load shows the error state.
    if (status.value) {
      if (!options.quiet) ElMessage.warning(app.t('modelStatus.refreshFailed'))
    } else {
      loadError.value = true
    }
  } finally {
    loading.value = false
    now.value = Date.now()
  }
}

function manualRefresh() {
  refreshCooldown.value = true
  window.clearTimeout(cooldownTimer)
  cooldownTimer = window.setTimeout(() => { refreshCooldown.value = false }, REFRESH_COOLDOWN_MS)
  void load()
}

function startAutoRefresh() {
  stopAutoRefresh()
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void load({ quiet: true })
  }, AUTO_REFRESH_MS)
}

function stopAutoRefresh() {
  window.clearInterval(refreshTimer)
  refreshTimer = undefined
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void load({ quiet: true })
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

function descriptionKey(state: ModelStatusState) {
  return ({ normal: 'descriptionNormal', degraded: 'descriptionDegraded', down: 'descriptionDown', unknown: 'descriptionUnknown' } as const)[state]
}

function formatPercent(value: number | null) {
  return value === null || value === undefined ? '—' : `${value}%`
}

function formatSeconds(value: number | null) {
  return value === null || value === undefined ? '—' : `${value}s`
}

function barTitle(item: ModelStatusItem, index: number) {
  const label = item.recent[index] === 1 ? app.t('modelStatus.barSuccess') : app.t('modelStatus.barFailure')
  const completedAt = item.recentCompletedAt[index]
  return completedAt ? `${label} · ${dayjs(completedAt).format('MM-DD HH:mm:ss')}` : label
}

onMounted(() => {
  void load()
  startAutoRefresh()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  stopAutoRefresh()
  window.clearTimeout(cooldownTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.model-status-page { display: grid; gap: 16px; }
.status-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.updated-at { color: var(--color-text-muted); font-size: 13px; }
.updated-at.stale { color: var(--color-warning); }
.refresh-button .el-icon { margin-right: 6px; }
.status-loading { min-height: 240px; }
.status-state { padding: 48px; display: grid; gap: 16px; justify-items: center; text-align: center; }
.status-state p { margin: 0; color: var(--color-text-muted); }
.status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }

.status-card { --state-color: var(--color-status-unknown); --state-soft: var(--color-status-unknown-soft); min-width: 0; padding: 20px; display: grid; gap: 18px; align-content: start; }
.status-card.is-normal { --state-color: var(--color-status-normal); --state-soft: var(--color-status-normal-soft); }
.status-card.is-degraded { --state-color: var(--color-status-degraded); --state-soft: var(--color-status-degraded-soft); }
.status-card.is-down { --state-color: var(--color-status-down); --state-soft: var(--color-status-down-soft); }

.card-head { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid var(--color-border); }
.pulse-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--state-soft); color: var(--state-color); }
.pulse-icon svg { width: 20px; height: 20px; }
.card-title { min-width: 0; }
.card-title h2 { margin: 2px 0 6px; overflow: hidden; font-size: 18px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
/* Reserve two lines so the rows below line up across cards. */
.card-title p { min-height: 2.8em; margin: 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.4; }

.availability-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid var(--color-border); font-weight: 600; }
.availability-value { color: var(--state-color); font-size: 34px; line-height: 1; font-variant-numeric: tabular-nums; }

.latency-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.latency-box { min-width: 0; padding: 14px; display: grid; gap: 8px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.latency-box span { color: var(--color-text-muted); font-size: 12px; }
.latency-box strong { font-size: 18px; font-variant-numeric: tabular-nums; }

.recent-block { display: grid; gap: 10px; }
.recent-title { font-size: 13px; font-weight: 600; }
.recent-bars { height: 24px; display: flex; gap: 2px; }
.recent-bars.empty { border-radius: 4px; background: var(--color-status-unknown-soft); }
.recent-bar { flex: 1 1 0; min-width: 2px; border-radius: 3px; }
.recent-bar.success { background: var(--color-status-normal); }
.recent-bar.failure { background: var(--color-status-down); }
.recent-axis { display: flex; justify-content: space-between; color: var(--color-text-muted); font-size: 11px; letter-spacing: .04em; }

@media (max-width: 1500px) { .status-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1180px) { .status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .status-grid { grid-template-columns: 1fr; } }
</style>
