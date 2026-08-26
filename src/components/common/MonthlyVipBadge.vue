<template>
  <el-tooltip
    v-if="isActive"
    :content="statusText"
    placement="top"
    :show-after="250"
  >
    <span class="monthly-vip-badge" role="status" :aria-label="statusText">
      <el-icon class="vip-badge__icon" aria-hidden="true"><StarFilled /></el-icon>
      <span class="vip-badge__label">VIP</span>
    </span>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { StarFilled } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import type { UserMembership } from '@/types/auth'

const props = defineProps<{
  membership?: UserMembership | null
}>()

const app = useAppStore()
const now = ref(Date.now())
let refreshTimer: number | null = null

const expiresAt = computed(() => {
  const value = Date.parse(props.membership?.expiresAt || '')
  return Number.isFinite(value) ? value : 0
})

const isActive = computed(() => {
  const tierCode = props.membership?.tierCode?.toLowerCase()
  const status = props.membership?.status?.toLowerCase()
  return tierCode === 'monthly_vip' && status === 'active' && expiresAt.value > now.value
})

const formattedExpiry = computed(() => {
  if (!expiresAt.value) return '-'
  return new Intl.DateTimeFormat(app.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(expiresAt.value))
})

const statusText = computed(() => app.t('profile.monthlyVipUntil').replace('{date}', formattedExpiry.value))

watch(
  () => [props.membership?.tierCode, props.membership?.status, props.membership?.expiresAt],
  scheduleRefresh,
  { immediate: true },
)

onBeforeUnmount(clearRefreshTimer)

function scheduleRefresh() {
  clearRefreshTimer()
  now.value = Date.now()
  const remaining = expiresAt.value - now.value
  if (remaining <= 0) return
  refreshTimer = window.setTimeout(scheduleRefresh, Math.min(remaining + 50, 30_000))
}

function clearRefreshTimer() {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer)
  refreshTimer = null
}
</script>

<style scoped>
.monthly-vip-badge {
  position: relative;
  isolation: isolate;
  flex: 0 0 auto;
  min-width: 56px;
  height: 24px;
  padding: 0 9px 0 7px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--color-vip-border);
  border-radius: 6px;
  background: linear-gradient(115deg, var(--color-vip-bg), var(--color-vip-bg-strong) 52%, var(--color-vip-bg));
  box-shadow: var(--shadow-vip);
  color: var(--color-vip-text);
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
}

.monthly-vip-badge::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 2px;
  border: 1px solid color-mix(in srgb, var(--color-vip-highlight) 48%, transparent);
  border-radius: 3px;
  pointer-events: none;
}

.monthly-vip-badge::after {
  content: '';
  position: absolute;
  z-index: 0;
  top: -45%;
  left: -28px;
  width: 18px;
  height: 190%;
  background: linear-gradient(90deg, transparent, var(--color-vip-highlight), transparent);
  transform: skewX(-18deg);
  animation: vip-badge-sweep 3.4s ease-in-out infinite;
  pointer-events: none;
}

.vip-badge__icon,
.vip-badge__label {
  position: relative;
  z-index: 1;
}

.vip-badge__icon {
  color: var(--color-vip-accent);
  font-size: 12px;
  filter: drop-shadow(0 1px 2px color-mix(in srgb, var(--color-vip-text) 24%, transparent));
  animation: vip-badge-star 2.2s ease-in-out infinite;
}

@keyframes vip-badge-sweep {
  0%, 54% { left: -28px; opacity: 0; }
  62% { opacity: .92; }
  82%, 100% { left: calc(100% + 16px); opacity: 0; }
}

@keyframes vip-badge-star {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 1px 2px color-mix(in srgb, var(--color-vip-text) 24%, transparent)); }
  50% { transform: scale(1.16); filter: drop-shadow(0 0 4px var(--color-vip-highlight)); }
}

@media (prefers-reduced-motion: reduce) {
  .monthly-vip-badge::after,
  .vip-badge__icon {
    animation: none;
  }
}
</style>
