<template>
  <div
    class="canvas-node"
    :class="[`is-${node.type}`, { 'is-selected': selected, 'is-connect-target': connectTarget }]"
    :style="nodeStyle"
    :data-node-id="node.id"
    @pointerdown="emit('node-pointerdown', $event)"
    @dblclick.stop="handleDoubleClick"
  >
    <div class="canvas-node-title" :title="titleText">
      <el-icon><component :is="titleIcon" /></el-icon>
      <span>{{ titleText }}</span>
    </div>

    <div class="canvas-node-body">
      <template v-if="node.type === 'image'">
        <CanvasAuthImage :src="assetThumbnailUrl(node.data.assetId)" :alt="titleText" :error-text="app.t('canvas.assetMissing')" />
      </template>

      <template v-else-if="node.type === 'text'">
        <textarea
          v-if="editing"
          ref="textEditor"
          v-model="draftText"
          class="canvas-text-editor"
          :style="{ fontSize: `${node.data.fontSize || 14}px` }"
          maxlength="5000"
          @pointerdown.stop
          @keydown.stop
          @blur="finishEditing"
        />
        <div v-else class="canvas-text-content" :style="{ fontSize: `${node.data.fontSize || 14}px` }">
          {{ node.data.content || app.t('canvas.textPlaceholder') }}
        </div>
      </template>

      <template v-else>
        <div v-if="generateImageUrl" class="canvas-generate-result">
          <CanvasAuthImage :src="generateImageUrl" :alt="titleText" :error-text="app.t('canvas.assetMissing')" />
        </div>
        <div v-else class="canvas-generate-empty">
          <el-icon><Picture /></el-icon>
        </div>
        <div v-if="busy" class="canvas-generate-overlay">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>{{ app.t('canvas.generating') }}</span>
        </div>
        <div v-else-if="runtime?.status === 'failed'" class="canvas-generate-overlay is-error" :title="runtime.error">
          <el-icon><WarningFilled /></el-icon>
          <span>{{ runtime.error }}</span>
        </div>
        <div v-if="(runtime?.results.length || 0) > 1" class="canvas-result-strip" @pointerdown.stop>
          <button
            v-for="(result, index) in runtime!.results"
            :key="`${result.taskId}-${result.resultOrdinal}`"
            type="button"
            :class="{ active: isPrimary(result) }"
            :aria-label="`${app.t('canvas.setPrimary')} ${index + 1}`"
            @click.stop="emit('select-result', result)"
          >{{ index + 1 }}</button>
        </div>
      </template>

      <span v-if="label" class="canvas-node-badge">{{ label }}</span>
    </div>

    <button
      v-if="node.type === 'generate' || hasInput"
      class="canvas-port is-input"
      type="button"
      :aria-label="app.t('canvas.inputPort')"
      @pointerdown.stop
    />
    <button
      v-if="node.type !== 'text'"
      class="canvas-port is-output"
      type="button"
      :aria-label="app.t('canvas.outputPort')"
      @pointerdown.stop="emit('port-pointerdown', $event)"
    />
    <span v-if="selected" class="canvas-resize-handle" @pointerdown.stop="emit('resize-pointerdown', $event)" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { EditPen, Loading, MagicStick, Picture, WarningFilled } from '@element-plus/icons-vue'
import CanvasAuthImage from './CanvasAuthImage.vue'
import { assetThumbnailUrl } from '@/services/canvases'
import { useAppStore } from '@/stores/app'
import type { CanvasGenerationResult, CanvasNodeRuntime } from '@/composables/useCanvasGeneration'
import type { CanvasNode } from '@/types/canvas'

const props = defineProps<{
  node: CanvasNode
  selected: boolean
  label?: string
  runtime?: CanvasNodeRuntime
  connectTarget?: boolean
  hasInput?: boolean
}>()

const emit = defineEmits<{
  'node-pointerdown': [event: PointerEvent]
  'port-pointerdown': [event: PointerEvent]
  'resize-pointerdown': [event: PointerEvent]
  'update-text': [content: string]
  'select-result': [result: CanvasGenerationResult]
  'open-panel': []
}>()

const app = useAppStore()
const editing = ref(false)
const draftText = ref('')
const textEditor = ref<HTMLTextAreaElement | null>(null)

const nodeStyle = computed(() => ({
  transform: `translate(${props.node.x}px, ${props.node.y}px)`,
  width: `${props.node.width}px`,
  height: `${props.node.height}px`,
}))
const titleIcon = computed(() => props.node.type === 'image' ? Picture : props.node.type === 'text' ? EditPen : MagicStick)
const titleText = computed(() => {
  if (props.node.title) return props.node.title
  if (props.node.type === 'generate') return props.node.data.prompt?.trim() || app.t('canvas.newGenerate')
  if (props.node.type === 'text') return app.t('canvas.tools.text')
  return app.t('canvas.imageNode')
})
const busy = computed(() => props.runtime?.status === 'submitting' || props.runtime?.status === 'running')
const generateImageUrl = computed(() => {
  if (props.node.type !== 'generate') return ''
  const primary = props.node.data.primaryResult
  if (primary?.assetId) return assetThumbnailUrl(primary.assetId)
  const result = props.runtime?.results.find((item) => isPrimary(item)) || props.runtime?.results[0]
  return result?.url || ''
})

function isPrimary(result: CanvasGenerationResult) {
  if (props.node.type !== 'generate') return false
  const primary = props.node.data.primaryResult
  return primary?.taskId === result.taskId && primary.resultOrdinal === result.resultOrdinal
}

async function handleDoubleClick() {
  if (props.node.type === 'text') {
    draftText.value = props.node.data.content || ''
    editing.value = true
    await nextTick()
    textEditor.value?.focus()
    return
  }
  if (props.node.type === 'generate') emit('open-panel')
}

function finishEditing() {
  editing.value = false
  if (props.node.type === 'text' && draftText.value !== (props.node.data.content || '')) emit('update-text', draftText.value)
}

</script>

<style scoped>
.canvas-node {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 14px;
  background: var(--color-surface);
  box-shadow: 0 6px 20px rgba(35, 37, 31, 0.08);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.canvas-node.is-selected {
  outline: 2px solid var(--canvas-accent);
  outline-offset: 2px;
}

.canvas-node.is-connect-target {
  outline: 2px dashed var(--canvas-accent);
  outline-offset: 4px;
}

.canvas-node-title {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 2px;
  display: flex;
  max-width: 100%;
  align-items: center;
  gap: 4px;
  color: var(--color-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.canvas-node-title span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.canvas-node-body {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 14px;
}

.canvas-node-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--canvas-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.canvas-text-content,
.canvas-text-editor {
  width: 100%;
  height: 100%;
  padding: 12px;
  overflow: auto;
  border: 0;
  background: transparent;
  color: var(--color-text);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  resize: none;
  outline: none;
  font-family: inherit;
}

.canvas-text-editor {
  cursor: text;
  user-select: text;
}

.canvas-generate-empty,
.canvas-generate-result {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, var(--color-surface), var(--color-bg));
  color: var(--color-border);
  font-size: 40px;
}

.canvas-generate-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--canvas-accent);
  font-size: 12px;
  text-align: center;
}

.canvas-generate-overlay.is-error {
  color: var(--color-danger);
}

.canvas-generate-overlay .el-icon {
  font-size: 24px;
}

.canvas-result-strip {
  position: absolute;
  bottom: 8px;
  left: 8px;
  display: flex;
  gap: 4px;
}

.canvas-result-strip button {
  width: 22px;
  height: 22px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 6px;
  background: rgba(35, 37, 31, 0.55);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
}

.canvas-result-strip button.active {
  background: var(--canvas-accent);
}

.canvas-port {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  padding: 0;
  border: 1.5px solid var(--color-text-muted);
  border-radius: 50%;
  background: var(--color-surface);
  transform: translateY(-50%);
  cursor: crosshair;
}

.canvas-port.is-input {
  left: -6px;
  cursor: default;
}

.canvas-port.is-output {
  right: -6px;
}

.canvas-port.is-output:hover {
  border-color: var(--canvas-accent);
  background: var(--canvas-accent);
}

.canvas-resize-handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--canvas-accent);
  cursor: nwse-resize;
}

:global(html.dark) .canvas-generate-overlay {
  background: rgba(32, 35, 25, 0.78);
}
</style>
