<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="min(920px, calc(100vw - 32px))"
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    class="canvas-image-edit-dialog"
    @close="emit('close')"
  >
    <div class="edit-toolbar">
      <template v-if="mode === 'crop'">
        <button
          v-for="item in cropRatios"
          :key="item.label"
          type="button"
          :class="{ active: item.value === cropRatio }"
          @click="setCropRatio(item.value)"
        >{{ item.label }}</button>
        <span class="edit-meta">{{ Math.round(crop.w) }} × {{ Math.round(crop.h) }}</span>
      </template>

      <template v-else-if="mode === 'mark'">
        <button
          v-for="color in markColors"
          :key="color"
          type="button"
          class="color-swatch"
          :class="{ active: color === markColor }"
          :style="{ background: color }"
          :aria-label="color"
          @click="markColor = color"
        />
        <span class="edit-divider" />
        <button
          v-for="item in brushSizes"
          :key="item.key"
          type="button"
          :class="{ active: item.key === brushKey }"
          :aria-label="`${app.t('canvas.imageEdit.brushSize')} ${item.key}`"
          @click="brushKey = item.key"
        ><span class="brush-dot" :style="{ width: `${item.dot}px`, height: `${item.dot}px` }" /></button>
        <span class="edit-divider" />
        <button type="button" :disabled="!strokes.length" @click="strokes.pop(); redrawMarks()">{{ app.t('canvas.imageEdit.markUndo') }}</button>
        <button type="button" :disabled="!strokes.length" @click="strokes.splice(0); redrawMarks()">{{ app.t('canvas.imageEdit.markClear') }}</button>
      </template>

      <template v-else>
        <span class="edit-label">{{ app.t('canvas.imageEdit.sliceRows') }}</span>
        <button v-for="count in 4" :key="`r${count}`" type="button" :class="{ active: sliceRows === count }" @click="sliceRows = count">{{ count }}</button>
        <span class="edit-divider" />
        <span class="edit-label">{{ app.t('canvas.imageEdit.sliceCols') }}</span>
        <button v-for="count in 4" :key="`c${count}`" type="button" :class="{ active: sliceCols === count }" @click="sliceCols = count">{{ count }}</button>
        <span class="edit-meta">{{ app.t('canvas.imageEdit.slicePieces').replace('{count}', String(sliceRows * sliceCols)) }}</span>
      </template>
    </div>

    <div class="edit-stage" :style="{ height: `${stageBox.height}px` }">
      <div v-if="loading" class="edit-state"><el-icon class="is-loading"><Loading /></el-icon></div>
      <div v-else-if="loadError" class="edit-state">{{ loadError }}</div>
      <div v-else ref="surface" class="edit-surface" :style="{ width: `${display.width}px`, height: `${display.height}px` }">
        <img :src="imageUrl" alt="" draggable="false" />

        <div v-if="mode === 'crop'" class="crop-overlay" @pointerdown="startCrop($event, 'new')">
          <!-- The shade is clipped to the image; the handles live outside the clip so edge handles stay grabbable. -->
          <div class="crop-dim"><div class="crop-shade" :style="cropStyle" /></div>
          <div class="crop-rect" :style="cropStyle" @pointerdown.stop="startCrop($event, 'move')">
            <span v-for="corner in corners" :key="corner" class="crop-handle" :class="corner" @pointerdown.stop="startCrop($event, corner)" />
          </div>
        </div>

        <canvas
          v-else-if="mode === 'mark'"
          ref="markCanvas"
          class="mark-canvas"
          :style="{ width: `${display.width}px`, height: `${display.height}px` }"
          @pointerdown="startStroke"
        />

        <svg v-else class="slice-grid" :width="display.width" :height="display.height">
          <line v-for="index in sliceCols - 1" :key="`v${index}`" :x1="index * display.width / sliceCols" :x2="index * display.width / sliceCols" y1="0" :y2="display.height" />
          <line v-for="index in sliceRows - 1" :key="`h${index}`" x1="0" :x2="display.width" :y1="index * display.height / sliceRows" :y2="index * display.height / sliceRows" />
        </svg>
      </div>
    </div>

    <template #footer>
      <div class="edit-footer">
        <span class="edit-hint">{{ app.t(`canvas.imageEdit.${mode}Hint`) }}</span>
        <el-button :disabled="exporting || busy" @click="emit('close')">{{ app.t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="exporting || busy" :disabled="!canConfirm" data-testid="canvas-image-edit-confirm" @click="confirm">
          {{ app.t('common.confirm') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { assetContentUrl } from '@/services/canvases'
import { useAppStore } from '@/stores/app'
import { fetchMediaBlob } from '@/utils/authenticatedMedia'

export type CanvasImageEditMode = 'crop' | 'mark' | 'slice'

interface Rect { x: number; y: number; w: number; h: number }
interface Stroke { color: string; size: number; points: Array<[number, number]> }
type CropHandle = 'nw' | 'ne' | 'sw' | 'se'
type CropDrag = { kind: 'new' | 'move' | CropHandle; startX: number; startY: number; origin: Rect }

const props = defineProps<{
  visible: boolean
  mode: CanvasImageEditMode
  assetId: string
  fileName: string
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [payload: { files: File[]; rows: number; cols: number }]
}>()

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MIN_CROP = 16
const app = useAppStore()
const corners: CropHandle[] = ['nw', 'ne', 'sw', 'se']
const markColors = ['#ff3b30', '#ffcc00', '#34c759', '#007aff', '#ffffff']
const brushSizes = [
  { key: 'S', ratio: 0.005, dot: 6 },
  { key: 'M', ratio: 0.01, dot: 10 },
  { key: 'L', ratio: 0.02, dot: 14 },
]

const loading = ref(false)
const loadError = ref('')
const exporting = ref(false)
const imageUrl = ref('')
const sourceType = ref('image/png')
const natural = reactive({ width: 0, height: 0 })
const surface = ref<HTMLElement | null>(null)
const markCanvas = ref<HTMLCanvasElement | null>(null)
const crop = reactive<Rect>({ x: 0, y: 0, w: 0, h: 0 })
const cropRatio = ref<number | null>(null)
const strokes = reactive<Stroke[]>([])
const markColor = ref(markColors[0])
const brushKey = ref('M')
const sliceRows = ref(2)
const sliceCols = ref(2)
let image: HTMLImageElement | null = null
let cropDrag: CropDrag | null = null
let activeStroke: Stroke | null = null
let loadToken = 0

const title = computed(() => app.t(`canvas.imageTools.${props.mode}`))
const cropRatios = computed(() => [
  { label: app.t('canvas.imageEdit.cropFree'), value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
])
const stageBox = computed(() => ({
  width: Math.max(240, Math.min(860, window.innerWidth - 96)),
  height: Math.max(240, Math.min(540, window.innerHeight - 300)),
}))
const scale = computed(() => natural.width && natural.height
  ? Math.min(stageBox.value.width / natural.width, stageBox.value.height / natural.height, 4)
  : 1)
const display = computed(() => ({ width: Math.round(natural.width * scale.value), height: Math.round(natural.height * scale.value) }))
const cropStyle = computed(() => ({
  left: `${crop.x * scale.value}px`,
  top: `${crop.y * scale.value}px`,
  width: `${crop.w * scale.value}px`,
  height: `${crop.h * scale.value}px`,
}))
const canConfirm = computed(() => {
  if (!imageUrl.value || loading.value || loadError.value) return false
  if (props.mode === 'crop') return true
  if (props.mode === 'mark') return strokes.length > 0
  return sliceRows.value * sliceCols.value > 1
})

watch(() => [props.visible, props.assetId] as const, ([visible]) => {
  if (visible) void loadImage()
  else reset()
}, { immediate: true })

onBeforeUnmount(() => {
  stopPointerTracking()
  reset()
})

async function loadImage() {
  const token = ++loadToken
  reset()
  loading.value = true
  try {
    const blob = await fetchMediaBlob(assetContentUrl(props.assetId))
    if (token !== loadToken) return
    const url = URL.createObjectURL(blob)
    const element = new Image()
    element.src = url
    await element.decode()
    if (token !== loadToken) {
      URL.revokeObjectURL(url)
      return
    }
    image = element
    imageUrl.value = url
    sourceType.value = blob.type || 'image/png'
    natural.width = element.naturalWidth
    natural.height = element.naturalHeight
    // Start with a 10% inset so the selection handles are visible against the image edges.
    Object.assign(crop, { x: natural.width * 0.1, y: natural.height * 0.1, w: natural.width * 0.8, h: natural.height * 0.8 })
    loading.value = false
    if (props.mode === 'mark') {
      await nextTick()
      redrawMarks()
    }
  } catch {
    if (token !== loadToken) return
    loadError.value = app.t('canvas.imageTools.loadFailed')
    loading.value = false
  }
}

function reset() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  image = null
  loadError.value = ''
  natural.width = 0
  natural.height = 0
  cropRatio.value = null
  strokes.splice(0)
}

function toImagePoint(event: PointerEvent) {
  const rect = surface.value?.getBoundingClientRect()
  const x = ((event.clientX - (rect?.left || 0)) / scale.value)
  const y = ((event.clientY - (rect?.top || 0)) / scale.value)
  return { x: clamp(x, 0, natural.width), y: clamp(y, 0, natural.height) }
}

function startPointerTracking() {
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopPointerTracking)
  window.addEventListener('pointercancel', stopPointerTracking)
}

function stopPointerTracking() {
  cropDrag = null
  activeStroke = null
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopPointerTracking)
  window.removeEventListener('pointercancel', stopPointerTracking)
}

function handlePointerMove(event: PointerEvent) {
  if (cropDrag) updateCrop(event)
  else if (activeStroke) extendStroke(event)
}

function startCrop(event: PointerEvent, kind: CropDrag['kind']) {
  if (event.button !== 0) return
  event.preventDefault()
  const point = toImagePoint(event)
  cropDrag = { kind, startX: point.x, startY: point.y, origin: { ...crop } }
  startPointerTracking()
}

function updateCrop(event: PointerEvent) {
  const drag = cropDrag!
  const point = toImagePoint(event)
  if (drag.kind === 'move') {
    crop.x = clamp(drag.origin.x + point.x - drag.startX, 0, natural.width - drag.origin.w)
    crop.y = clamp(drag.origin.y + point.y - drag.startY, 0, natural.height - drag.origin.h)
    return
  }
  // The corner opposite to the dragged one stays fixed; a new selection is anchored at the press point.
  const { origin } = drag
  const fixedX = drag.kind === 'new' ? drag.startX : drag.kind.endsWith('w') ? origin.x + origin.w : origin.x
  const fixedY = drag.kind === 'new' ? drag.startY : drag.kind.startsWith('n') ? origin.y + origin.h : origin.y
  if (drag.kind === 'new' && Math.abs(point.x - fixedX) < 2 && Math.abs(point.y - fixedY) < 2) return
  const dirX = point.x >= fixedX ? 1 : -1
  const dirY = point.y >= fixedY ? 1 : -1
  const maxW = dirX > 0 ? natural.width - fixedX : fixedX
  const maxH = dirY > 0 ? natural.height - fixedY : fixedY
  let w = Math.min(Math.max(Math.abs(point.x - fixedX), MIN_CROP), maxW)
  let h = Math.min(Math.max(Math.abs(point.y - fixedY), MIN_CROP), maxH)
  if (cropRatio.value) {
    h = w / cropRatio.value
    if (h > maxH) {
      h = maxH
      w = h * cropRatio.value
    }
  }
  crop.w = w
  crop.h = h
  crop.x = dirX > 0 ? fixedX : fixedX - w
  crop.y = dirY > 0 ? fixedY : fixedY - h
}

function setCropRatio(ratio: number | null) {
  cropRatio.value = ratio
  if (!ratio) return
  // Largest selection with the ratio that fits the image, centred on the current selection.
  const width = Math.min(natural.width, natural.height * ratio)
  const height = width / ratio
  const centerX = crop.x + crop.w / 2
  const centerY = crop.y + crop.h / 2
  Object.assign(crop, {
    w: width,
    h: height,
    x: clamp(centerX - width / 2, 0, natural.width - width),
    y: clamp(centerY - height / 2, 0, natural.height - height),
  })
}

function startStroke(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  const point = toImagePoint(event)
  const ratio = brushSizes.find((item) => item.key === brushKey.value)?.ratio || 0.01
  activeStroke = { color: markColor.value, size: Math.max(3, Math.max(natural.width, natural.height) * ratio), points: [[point.x, point.y]] }
  strokes.push(activeStroke)
  redrawMarks()
  startPointerTracking()
}

function extendStroke(event: PointerEvent) {
  const point = toImagePoint(event)
  activeStroke!.points.push([point.x, point.y])
  redrawMarks()
}

function redrawMarks() {
  const canvas = markCanvas.value
  if (!canvas || !natural.width) return
  const ratio = window.devicePixelRatio || 1
  const width = Math.round(display.value.width * ratio)
  const height = Math.round(display.value.height * ratio)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, width, height)
  drawStrokes(context, scale.value * ratio)
}

function drawStrokes(context: CanvasRenderingContext2D, factor: number) {
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const stroke of strokes) {
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    context.lineWidth = stroke.size * factor
    const [first, ...rest] = stroke.points
    if (!rest.length) {
      context.beginPath()
      context.arc(first[0] * factor, first[1] * factor, (stroke.size * factor) / 2, 0, Math.PI * 2)
      context.fill()
      continue
    }
    context.beginPath()
    context.moveTo(first[0] * factor, first[1] * factor)
    rest.forEach(([x, y]) => context.lineTo(x * factor, y * factor))
    context.stroke()
  }
}

async function confirm() {
  if (!image || !canConfirm.value) return
  exporting.value = true
  try {
    const base = props.fileName.replace(/\.[a-z0-9]+$/i, '').slice(0, 80) || 'image'
    let files: File[]
    if (props.mode === 'crop') {
      const rect = roundRect(crop)
      files = [await exportRegion(rect, `${base}-crop`)]
    } else if (props.mode === 'mark') {
      const canvas = createCanvas(natural.width, natural.height)
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      drawStrokes(context, 1)
      files = [await canvasToFile(canvas, `${base}-mark`, 'image/png')]
    } else {
      files = []
      for (let row = 0; row < sliceRows.value; row += 1) {
        for (let col = 0; col < sliceCols.value; col += 1) {
          const x = Math.round(col * natural.width / sliceCols.value)
          const y = Math.round(row * natural.height / sliceRows.value)
          const rect = {
            x,
            y,
            w: Math.round((col + 1) * natural.width / sliceCols.value) - x,
            h: Math.round((row + 1) * natural.height / sliceRows.value) - y,
          }
          files.push(await exportRegion(rect, `${base}-r${row + 1}c${col + 1}`))
        }
      }
    }
    emit('confirm', { files, rows: sliceRows.value, cols: sliceCols.value })
  } catch (error) {
    ElMessage.error((error as Error)?.message === 'too-large' ? app.t('canvas.imageTools.exportTooLarge') : app.t('canvas.imageEdit.exportFailed'))
  } finally {
    exporting.value = false
  }
}

function exportRegion(rect: Rect, name: string) {
  const canvas = createCanvas(rect.w, rect.h)
  canvas.getContext('2d')!.drawImage(image!, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)
  return canvasToFile(canvas, name, sourceType.value)
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  return canvas
}

// Keeps the source format when possible and falls back to lossy formats to stay within the 10MB upload limit.
async function canvasToFile(canvas: HTMLCanvasElement, name: string, preferredType: string) {
  const lossy: Array<[string, number]> = [['image/webp', 0.92], ['image/jpeg', 0.9], ['image/jpeg', 0.8]]
  const attempts: Array<[string, number | undefined]> = preferredType === 'image/jpeg'
    ? [['image/jpeg', 0.92], ...lossy.slice(1)]
    : preferredType === 'image/webp' ? lossy : [['image/png', undefined], ...lossy]
  for (const [type, quality] of attempts) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
    if (!blob || blob.type !== type || blob.size > MAX_UPLOAD_BYTES) continue
    const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length)
    return new File([blob], `${name}.${extension}`, { type })
  }
  throw new Error('too-large')
}

function roundRect(rect: Rect): Rect {
  const x = clamp(Math.round(rect.x), 0, natural.width - 1)
  const y = clamp(Math.round(rect.y), 0, natural.height - 1)
  return { x, y, w: clamp(Math.round(rect.w), 1, natural.width - x), h: clamp(Math.round(rect.h), 1, natural.height - y) }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
</script>

<style scoped>
.edit-toolbar {
  display: flex;
  min-height: 34px;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.edit-toolbar button {
  display: inline-flex;
  min-width: 34px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
}

.edit-toolbar button:hover:not(:disabled) {
  border-color: var(--color-text-muted);
}

.edit-toolbar button.active {
  border-color: var(--color-text);
  box-shadow: inset 0 0 0 1px var(--color-text);
}

.edit-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.edit-toolbar .color-swatch {
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
}

.brush-dot {
  display: block;
  border-radius: 50%;
  background: currentColor;
}

.edit-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--color-border);
}

.edit-label,
.edit-meta {
  color: var(--color-text-muted);
  font-size: 12px;
}

.edit-meta {
  margin-left: auto;
}

.edit-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  background:
    repeating-conic-gradient(rgba(35, 37, 31, 0.06) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px,
    var(--color-bg);
}

.edit-state {
  color: var(--color-text-muted);
  font-size: 28px;
}

.edit-surface {
  position: relative;
  user-select: none;
  touch-action: none;
}

.edit-surface img {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.crop-overlay,
.mark-canvas,
.slice-grid {
  position: absolute;
  inset: 0;
}

.crop-overlay {
  cursor: crosshair;
}

.crop-dim {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.crop-shade {
  position: absolute;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
}

.crop-rect {
  position: absolute;
  border: 1.5px solid #fff;
  cursor: move;
}

.crop-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 3px;
  background: var(--canvas-accent);
}

.crop-handle.nw { top: -7px; left: -7px; cursor: nwse-resize; }
.crop-handle.ne { top: -7px; right: -7px; cursor: nesw-resize; }
.crop-handle.sw { bottom: -7px; left: -7px; cursor: nesw-resize; }
.crop-handle.se { right: -7px; bottom: -7px; cursor: nwse-resize; }

.mark-canvas {
  cursor: crosshair;
}

.slice-grid {
  pointer-events: none;
}

.slice-grid line {
  stroke: #fff;
  stroke-width: 2;
  stroke-dasharray: 6 4;
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8));
}

.edit-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-hint {
  flex: 1;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: left;
}
</style>
