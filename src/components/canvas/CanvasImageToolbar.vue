<template>
  <div class="image-toolbar" role="toolbar" :aria-label="app.t('canvas.imageTools.label')" @pointerdown.stop @wheel.stop @dblclick.stop>
    <button
      v-for="item in items"
      :key="item.action"
      type="button"
      :data-testid="`canvas-image-tool-${item.action}`"
      :disabled="Boolean(busy) || item.disabled"
      :title="item.disabled ? item.disabledHint : item.label"
      @click="emit('action', item.action)"
    >
      <el-icon :class="{ 'is-loading': busy === item.action }"><component :is="busy === item.action ? Loading : item.icon" /></el-icon>
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Brush, Document, Download, EditPen, FullScreen, Grid, Loading, Scissor, ZoomIn } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'

export type CanvasImageToolAction = 'download' | 'mark' | 'describe' | 'cutout' | 'crop' | 'slice' | 'upscale' | 'preview'

const props = defineProps<{
  busy: CanvasImageToolAction | null
  canDescribe: boolean
}>()

const emit = defineEmits<{ action: [action: CanvasImageToolAction] }>()

const app = useAppStore()
const items = computed(() => [
  { action: 'download' as const, icon: Download },
  { action: 'mark' as const, icon: EditPen },
  { action: 'describe' as const, icon: Document, disabled: !props.canDescribe, disabledHint: app.t('canvas.imageTools.describeUnavailable') },
  { action: 'cutout' as const, icon: Brush },
  { action: 'crop' as const, icon: Scissor },
  { action: 'slice' as const, icon: Grid },
  { action: 'upscale' as const, icon: ZoomIn },
  { action: 'preview' as const, icon: FullScreen },
].map((item) => ({ disabled: false, disabledHint: '', ...item, label: app.t(`canvas.imageTools.${item.action}`) })))
</script>

<style scoped>
.image-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card-hover);
  white-space: nowrap;
  cursor: default;
}

.image-toolbar button {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
}

.image-toolbar button:hover:not(:disabled) {
  background: var(--color-primary-soft);
}

.image-toolbar button:active:not(:disabled) {
  background: var(--color-border);
}

.image-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.image-toolbar .el-icon {
  font-size: 15px;
}
</style>
