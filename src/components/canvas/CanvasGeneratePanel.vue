<template>
  <div class="generate-panel" :class="{ expanded }" @pointerdown.stop @wheel.stop @dblclick.stop>
    <div class="panel-references">
      <button class="reference-add" type="button" :disabled="inputs.length >= maxInputs" @click="emit('reference')">
        <el-icon><PictureFilled /></el-icon>
        <span>{{ app.t('canvas.reference') }}</span>
      </button>
      <div
        v-for="(input, index) in inputs"
        :key="input.nodeId"
        class="reference-thumb"
        :class="{ 'is-pending': !input.assetId }"
        :title="input.assetId ? input.label : app.t('canvas.inputNotReady')"
      >
        <CanvasAuthImage v-if="input.thumbnailUrl" :src="input.thumbnailUrl" :alt="input.label" />
        <span class="reference-index">{{ index + 1 }}</span>
      </div>
      <button class="panel-expand" type="button" :aria-label="app.t('canvas.expandPanel')" @click="expanded = !expanded">
        <el-icon><component :is="expanded ? Fold : FullScreen" /></el-icon>
      </button>
    </div>

    <CanvasPromptEditor
      class="prompt-wrap"
      :model-value="node.data.prompt || ''"
      :inputs="inputs"
      :placeholder="app.t('canvas.promptPlaceholder')"
      :max-length="4000"
      :expanded="expanded"
      @update:model-value="emit('update', { prompt: $event })"
      @submit="submit"
    />

    <div v-if="notice" class="panel-notice" role="alert">
      <span>{{ notice.text }}</span>
      <el-button v-if="notice.action" link type="primary" @click="notice.action.run">{{ notice.action.label }}</el-button>
    </div>

    <div class="panel-footer">
      <el-select
        class="model-select"
        :model-value="node.data.modelCode || ''"
        :placeholder="app.t('canvas.noModel')"
        :teleported="false"
        @update:model-value="updateParams({ modelCode: $event })"
      >
        <template #prefix><el-icon><MagicStick /></el-icon></template>
        <el-option v-for="model in options.models.value" :key="model.value" :label="model.name || model.label" :value="model.value" />
      </el-select>

      <!-- A plain in-panel popover: no popper positioning, transitions or focus trap on every click. -->
      <div ref="settingsWrap" class="settings-wrap">
        <button class="settings-trigger" :class="{ open: settingsOpen }" type="button" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">
          <el-icon><Operation /></el-icon>
          <span>{{ options.summaryText.value }}</span>
        </button>
        <div v-if="settingsOpen" class="image-settings" role="dialog" :aria-label="app.t('canvas.imageSettings')">
          <h4>{{ app.t('canvas.imageSettings') }}</h4>
          <template v-if="options.supportsQuality.value">
            <label>{{ app.t('canvas.quality') }}</label>
            <div class="choice-row">
              <button
                v-for="item in options.qualityOptions.value"
                :key="item.value"
                type="button"
                :class="{ active: item.value === node.data.qualityCode }"
                @click="updateParams({ qualityCode: item.value })"
              >{{ shortQuality(item.value) }}</button>
            </div>
          </template>
          <label>{{ app.t('canvas.resolution') }}</label>
          <div class="choice-row">
            <button
              v-for="item in options.resolutionOptions.value"
              :key="item.value"
              type="button"
              :disabled="options.isAuto.value"
              :class="{ active: !options.isAuto.value && item.value === node.data.resolutionCode }"
              @click="updateParams({ resolutionCode: item.value })"
            >{{ item.value.toUpperCase() }}</button>
          </div>
          <label>{{ app.t('canvas.aspectRatio') }}</label>
          <div class="aspect-grid">
            <button
              v-for="item in options.aspectOptions.value"
              :key="item.value"
              type="button"
              :class="{ active: item.value === options.selectedAspect.value }"
              @click="updateParams(options.aspectPatch(item.value))"
            >
              <span v-if="item.value !== 'auto'" class="aspect-shape" :style="aspectShape(item.value)" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <span class="footer-spacer" />

      <el-select
        class="count-select"
        :model-value="options.imageCount.value"
        :teleported="false"
        @update:model-value="emit('update', { imageCount: Number($event) })"
      >
        <el-option v-for="count in options.maxImageCount.value" :key="count" :label="`${count}${app.t('canvas.countUnit')}`" :value="count" />
      </el-select>

      <el-button type="primary" class="generate-button" :loading="busy" :disabled="!canGenerate" @click="submit">
        {{ busy ? app.t('canvas.generating') : app.t('canvas.generate') }}
        <span v-if="!busy && options.estimatedPoints.value !== null" class="generate-points">({{ options.estimatedPoints.value }})</span>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Fold, FullScreen, MagicStick, Operation, PictureFilled } from '@element-plus/icons-vue'
import CanvasAuthImage from './CanvasAuthImage.vue'
import CanvasPromptEditor from './CanvasPromptEditor.vue'
import { useCanvasGenerationOptions } from '@/composables/useCanvasGenerationOptions'
import { useAppStore } from '@/stores/app'
import { MAX_GENERATE_INPUTS } from '@/utils/canvasDocument'
import type { CanvasNodeRuntime } from '@/composables/useCanvasGeneration'
import type { CanvasGenerateNode, CanvasGenerateNodeData, CanvasPanelInput } from '@/types/canvas'
import type { CreateImageTaskRequest } from '@/types/image'

const props = defineProps<{
  node: CanvasGenerateNode
  inputs: CanvasPanelInput[]
  runtime?: CanvasNodeRuntime
  balance: number | null
  optionsReady: boolean
}>()

const emit = defineEmits<{
  update: [patch: Partial<CanvasGenerateNodeData>]
  // The user explicitly changed generation parameters; the editor remembers them for new nodes.
  remember: []
  generate: [request: Omit<CreateImageTaskRequest, 'idempotencyKey'>]
  reference: []
  recharge: []
  retryOptions: []
}>()

const app = useAppStore()
const options = useCanvasGenerationOptions(() => props.node.data)
const maxInputs = MAX_GENERATE_INPUTS
const expanded = ref(false)
const settingsOpen = ref(false)
const settingsWrap = ref<HTMLElement | null>(null)

const busy = computed(() => props.runtime?.status === 'submitting' || props.runtime?.status === 'running')
const inputsReady = computed(() => props.inputs.every((input) => Boolean(input.assetId)))
const insufficientPoints = computed(() => props.balance !== null
  && options.estimatedPoints.value !== null
  && options.estimatedPoints.value > props.balance)
const canGenerate = computed(() => !busy.value
  && props.optionsReady
  && Boolean(props.node.data.prompt?.trim())
  && options.parametersValid.value
  && options.estimatedPoints.value !== null
  && inputsReady.value
  && !insufficientPoints.value)
const notice = computed<{ text: string; action?: { label: string; run: () => void } } | null>(() => {
  if (!props.optionsReady) return { text: app.t('playground.optionsUnavailable'), action: { label: app.t('common.retry'), run: () => emit('retryOptions') } }
  if (options.pricingFailed.value) return { text: app.t('playground.pricingUnavailable'), action: { label: app.t('common.retry'), run: () => void options.ensurePricing(true) } }
  if (options.pricingReady.value && options.parametersValid.value && options.estimatedPoints.value === null) {
    return { text: app.t('playground.pricingUnavailable') }
  }
  if (!inputsReady.value) return { text: app.t('canvas.inputNotReady') }
  if (insufficientPoints.value) return { text: app.t('playground.insufficientPoints'), action: { label: app.t('pricing.getMoreCredits'), run: () => emit('recharge') } }
  return null
})

watch(() => options.selectedModel.value?.value, () => void options.ensurePricing(), { immediate: true })
// Only the generation parameters can invalidate each other; prompt keystrokes and run history must not re-run reconcile.
watch(
  () => {
    const data = props.node.data
    return [
      options.selectedModel.value?.value, options.pricingReady.value, options.models.value.length,
      data.modelCode, data.catalogVersion, data.sizeMode, data.resolutionCode, data.qualityCode, data.aspectRatioCode, data.imageCount,
    ]
  },
  () => {
    const patch = options.reconcile()
    if (patch) emit('update', patch)
  },
  { immediate: true },
)

watch(settingsOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', handleOutsidePointer, true)
    document.addEventListener('keydown', handleSettingsKeydown, true)
  } else {
    removeSettingsListeners()
  }
})
onBeforeUnmount(removeSettingsListeners)

function removeSettingsListeners() {
  document.removeEventListener('pointerdown', handleOutsidePointer, true)
  document.removeEventListener('keydown', handleSettingsKeydown, true)
}

function handleOutsidePointer(event: PointerEvent) {
  if (!settingsWrap.value?.contains(event.target as Node)) settingsOpen.value = false
}

function handleSettingsKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') settingsOpen.value = false
}

// Emitted after reconcile has applied any follow-up patch, so the remembered parameters are already consistent.
async function updateParams(patch: Partial<CanvasGenerateNodeData>) {
  emit('update', patch)
  await nextTick()
  emit('remember')
}

function submit() {
  if (!canGenerate.value) return
  const request = options.buildRequest(props.node.data.prompt!.trim(), props.inputs.map((input) => input.assetId))
  if (request) emit('generate', request)
}

function shortQuality(code: string) {
  const key = code.toLowerCase()
  if (key === 'med' || key === 'medium') return 'Medium'
  return code.charAt(0).toUpperCase() + code.slice(1)
}

function aspectShape(code: string) {
  const match = code.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  if (!match) return {}
  const width = Number(match[1])
  const height = Number(match[2])
  const max = 18
  return width >= height
    ? { width: `${max}px`, height: `${Math.max(6, Math.round(max * height / width))}px` }
    : { width: `${Math.max(6, Math.round(max * width / height))}px`, height: `${max}px` }
}
</script>

<style scoped>
.generate-panel {
  width: 575px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card-hover);
  cursor: default;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.generate-panel.expanded {
  width: 760px;
}

.panel-references {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reference-add,
.reference-thumb {
  position: relative;
  width: 50px;
  height: 50px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
}

.reference-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--color-text);
  font-size: 11px;
  cursor: pointer;
}

.reference-add:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.reference-thumb.is-pending {
  border-style: dashed;
  opacity: 0.6;
}

.reference-index {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 10px;
  font-weight: 600;
}

.reference-thumb .reference-index {
  position: absolute;
  top: 3px;
  right: 3px;
}

.panel-expand {
  margin-left: auto;
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.panel-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--color-warning);
  font-size: 12px;
}

.panel-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-spacer {
  flex: 1;
}

.model-select {
  width: 170px;
}

.count-select {
  width: 76px;
}

.settings-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
}

.settings-trigger:hover,
.settings-trigger.open {
  background: var(--color-primary-soft);
}

.generate-points {
  margin-left: 2px;
}

.settings-wrap {
  position: relative;
}

.image-settings {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  z-index: 20;
  width: 320px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card-hover);
}

.image-settings h4 {
  margin: 0 0 10px;
  font-size: 15px;
}

.image-settings label {
  display: block;
  margin: 10px 0 6px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.choice-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.choice-row button,
.aspect-grid button {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
}

.choice-row button {
  height: 30px;
}

.choice-row button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.aspect-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.aspect-grid button {
  display: flex;
  height: 58px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 10px;
}

.choice-row button:hover:not(:disabled),
.aspect-grid button:hover {
  border-color: var(--color-text-muted);
}

.choice-row button:active:not(:disabled),
.aspect-grid button:active {
  background: var(--color-primary-soft);
}

.choice-row button.active,
.aspect-grid button.active {
  border-color: var(--color-text);
  box-shadow: inset 0 0 0 1px var(--color-text);
}

.aspect-shape {
  display: block;
  border: 1.5px solid currentColor;
  border-radius: 2px;
}
</style>
