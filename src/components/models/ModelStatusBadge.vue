<template>
  <span class="model-status-badge" :class="`is-${state}`" :data-state="state">
    <el-icon><component :is="icon" /></el-icon>
    <span>{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheck, CircleClose, QuestionFilled, Warning } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import type { ModelStatusState } from '@/types/models'

const props = defineProps<{ state: ModelStatusState }>()
const app = useAppStore()

const icon = computed(() => ({
  normal: CircleCheck,
  degraded: Warning,
  down: CircleClose,
  unknown: QuestionFilled,
})[props.state])

const label = computed(() => app.t(`modelStatus.${stateKey(props.state)}`))

function stateKey(state: ModelStatusState) {
  return ({ normal: 'stateNormal', degraded: 'stateDegraded', down: 'stateDown', unknown: 'stateUnknown' } as const)[state]
}
</script>

<style scoped>
.model-status-badge { --badge-color: var(--color-status-unknown); --badge-bg: var(--color-status-unknown-soft); display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; padding: 3px 10px; border: 1px solid var(--badge-color); border-radius: 999px; background: var(--badge-bg); color: var(--badge-color); font-size: 12px; font-weight: 700; line-height: 18px; white-space: nowrap; }
.model-status-badge.is-normal { --badge-color: var(--color-status-normal); --badge-bg: var(--color-status-normal-soft); }
.model-status-badge.is-degraded { --badge-color: var(--color-status-degraded); --badge-bg: var(--color-status-degraded-soft); }
.model-status-badge.is-down { --badge-color: var(--color-status-down); --badge-bg: var(--color-status-down-soft); }
</style>
