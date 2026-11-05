<template>
  <div class="canvas-editor" :class="`bg-${doc.background}`">
    <header class="editor-header">
      <button class="header-back" type="button" :aria-label="app.t('canvas.back')" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <input
        v-model="titleDraft"
        class="title-input"
        maxlength="100"
        :aria-label="app.t('canvas.rename')"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
        @keydown.stop
        @blur="commitTitle"
      />
      <span class="header-spacer" />
      <div class="save-status" :class="`is-${persistence.status.value}`" data-testid="canvas-save-status">
        <el-icon v-if="persistence.status.value === 'saving'" class="is-loading"><Loading /></el-icon>
        <el-icon v-else-if="persistence.status.value === 'saved'"><CircleCheck /></el-icon>
        <el-icon v-else-if="persistence.status.value === 'error' || persistence.status.value === 'conflict'"><WarningFilled /></el-icon>
        <span>{{ saveStatusText }}</span>
        <el-button v-if="persistence.status.value === 'error'" link type="primary" @click="persistence.retry()">{{ app.t('common.retry') }}</el-button>
      </div>
    </header>

    <div v-if="loadError" class="editor-load-error">
      <p>{{ loadError }}</p>
      <el-button @click="router.push({ name: 'canvas' })">{{ app.t('canvas.back') }}</el-button>
    </div>

    <div
      v-else
      ref="stage"
      v-loading="loading"
      class="editor-stage"
      :class="{ 'is-panning': interaction?.kind === 'pan' || spacePressed }"
      @pointerdown="handleStagePointerDown"
      @mousedown.middle.prevent
      @wheel.prevent="handleWheel"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <div class="stage-grid" :style="gridStyle" />
      <div class="world" :style="worldStyle">
        <div
          v-for="group in groupFrames"
          :key="group.id"
          class="group-frame"
          :class="{ selected: group.selected }"
          :data-group-id="group.id"
          :style="{ transform: `translate(${group.x}px, ${group.y}px)`, width: `${group.width}px`, height: `${group.height}px` }"
          @pointerdown="handleGroupPointerDown(group.id, $event)"
        />
        <svg class="connections" width="1" height="1">
          <g v-for="edge in edgePaths" :key="edge.id">
            <path :d="edge.d" class="connection-path" :class="{ active: edge.active }" />
            <path v-if="edge.flowing" :d="edge.d" class="connection-flow" />
          </g>
          <path v-if="pendingEdgePath" :d="pendingEdgePath" class="connection-path pending" />
        </svg>
        <button
          v-for="edge in activeEdges"
          :key="`cut-${edge.id}`"
          type="button"
          class="connection-cut"
          :style="{ transform: `translate(${edge.midX - 12}px, ${edge.midY - 12}px)` }"
          :aria-label="app.t('canvas.disconnect')"
          @pointerdown.stop
          @click.stop="disconnect(edge.id)"
        >
          <el-icon><Scissor /></el-icon>
        </button>
        <CanvasNodeView
          v-for="node in doc.nodes"
          :key="node.id"
          :node="node"
          :selected="selected.has(node.id) && !(node.groupId && selectedGroupId === node.groupId)"
          :label="inputLabels.get(node.id)"
          :runtime="generation.runtime.get(node.id)"
          :connect-target="connectHoverId === node.id"
          :has-input="node.type === 'image' && connectedTargets.has(node.id)"
          @node-pointerdown="handleNodePointerDown(node, $event)"
          @port-pointerdown="handlePortPointerDown(node, $event)"
          @resize-pointerdown="handleResizePointerDown(node, $event)"
          @update-text="updateText(node, $event)"
          @select-result="selectResult(node, $event)"
          @open-panel="selectOnly(node.id)"
        />
        <div v-if="marquee" class="marquee" :style="marqueeStyle" />
      </div>

      <div v-if="activeGenerateNode" class="panel-anchor" :style="panelStyle">
        <CanvasGeneratePanel
          :node="activeGenerateNode"
          :inputs="panelInputs"
          :runtime="generation.runtime.get(activeGenerateNode.id)"
          :balance="credits.summaryLoaded ? credits.summary.balance : null"
          :options-ready="optionsReady"
          @update="patchGenerateNode(activeGenerateNode, $event)"
          @generate="generation.submit(activeGenerateNode.id, $event)"
          @reference="openUpload(true)"
          @recharge="openRecharge"
          @retry-options="loadOptions"
        />
      </div>

      <div v-if="groupToolbar" class="group-toolbar" :style="groupToolbar.style" @pointerdown.stop>
        <button v-if="groupToolbar.mode === 'group'" type="button" data-testid="canvas-group" @click="groupSelected">
          <el-icon><FolderAdd /></el-icon>
          <span>{{ app.t('canvas.group') }}</span>
        </button>
        <button v-else type="button" data-testid="canvas-ungroup" @click="ungroupSelected">
          <el-icon><FolderRemove /></el-icon>
          <span>{{ app.t('canvas.ungroup') }}</span>
        </button>
      </div>

      <div v-if="toolNode" ref="toolbarAnchor" class="image-toolbar-anchor" :style="toolbarStyle">
        <CanvasImageToolbar :busy="toolBusy" :can-describe="Boolean(sourceTaskId(toolNode))" @action="runImageTool" />
      </div>

      <div v-if="!loading && !doc.nodes.length" class="empty-hint">
        <p>{{ app.t('canvas.emptyHint') }}</p>
      </div>

      <div v-if="minimapOpen && minimap" class="minimap" :class="{ 'with-drawer': galleryOpen }" data-testid="canvas-minimap" @pointerdown.stop>
        <svg
          :width="MINIMAP_WIDTH"
          :height="MINIMAP_HEIGHT"
          @pointerdown="handleMinimapPointerDown"
          @pointermove="handleMinimapPointerMove"
          @pointerup="minimapDrag = null"
          @pointercancel="minimapDrag = null"
        >
          <rect
            v-for="node in minimap.nodes"
            :key="node.id"
            class="minimap-node"
            :class="{ selected: selected.has(node.id) }"
            :x="node.x"
            :y="node.y"
            :width="node.width"
            :height="node.height"
            rx="1.5"
          />
          <rect class="minimap-view" :x="minimap.view.x" :y="minimap.view.y" :width="minimap.view.width" :height="minimap.view.height" rx="2" />
        </svg>
      </div>

      <div class="corner-controls" :class="{ 'with-drawer': galleryOpen }" @pointerdown.stop>
        <button type="button" :class="{ active: galleryOpen }" @click="galleryOpen = !galleryOpen">
          <el-icon><Picture /></el-icon>
          <span>{{ app.t('canvas.gallery') }}</span>
        </button>
        <span class="control-divider" />
        <button
          type="button"
          :class="{ active: minimapOpen }"
          :aria-label="minimapLabel"
          :title="minimapLabel"
          data-testid="canvas-minimap-toggle"
          @click="toggleMinimap"
        >
          <el-icon><Compass /></el-icon>
        </button>
        <button type="button" :aria-label="app.t('canvas.tools.fitView')" :title="app.t('canvas.tools.fitView')" @click="fitView">
          <el-icon><Aim /></el-icon>
        </button>
        <button type="button" class="zoom-text" :title="app.t('canvas.tools.resetZoom')" @click="zoomTo(1)">{{ Math.round(doc.viewport.zoom * 100) }}%</button>
      </div>

      <div class="toolbar" @pointerdown.stop>
        <button type="button" :disabled="!history.canUndo.value" :title="app.t('canvas.tools.undo')" @click="history.undo()"><CanvasToolbarIcon name="undo" /></button>
        <button type="button" :disabled="!history.canRedo.value" :title="app.t('canvas.tools.redo')" @click="history.redo()"><CanvasToolbarIcon name="redo" /></button>
        <span class="control-divider" />
        <button type="button" :title="app.t('canvas.tools.text')" data-testid="canvas-add-text" @click="addTextNode"><CanvasToolbarIcon name="text" /></button>
        <button type="button" :title="app.t('canvas.tools.generate')" data-testid="canvas-add-generate" @click="addGenerateNode"><CanvasToolbarIcon name="image" /></button>
        <button type="button" :title="app.t('canvas.tools.upload')" @click="openUpload(false)"><CanvasToolbarIcon name="upload" /></button>
        <button type="button" :title="app.t('canvas.tools.background')" @click="cycleBackground"><CanvasToolbarIcon name="palette" /></button>
        <button type="button" :title="app.t('canvas.tools.insertImage')" @click="galleryOpen = true"><CanvasToolbarIcon name="grid" /></button>
        <span class="control-divider" />
        <button type="button" class="danger" :disabled="!selected.size" :title="app.t('canvas.tools.delete')" @click="deleteSelected"><CanvasToolbarIcon name="trash" /></button>
        <span class="control-divider" />
        <button type="button" class="danger" :disabled="!doc.nodes.length" :title="app.t('canvas.tools.clear')" @click="clearCanvas"><CanvasToolbarIcon name="eraser" /></button>
        <span class="control-divider" />
        <button
          ref="shortcutsButton"
          type="button"
          :class="{ active: shortcutsOpen }"
          :title="app.t('canvas.tools.shortcuts')"
          :aria-expanded="shortcutsOpen"
          data-testid="canvas-shortcuts"
          @click="shortcutsOpen = !shortcutsOpen"
        >
          <CanvasToolbarIcon name="keyboard" />
        </button>
      </div>

      <div v-if="shortcutsOpen" ref="shortcutsPanel" class="shortcut-panel" data-testid="canvas-shortcut-panel" @pointerdown.stop @wheel.stop>
        <button type="button" class="shortcut-close" :aria-label="app.t('canvas.shortcutClose')" @click="shortcutsOpen = false"><el-icon><Close /></el-icon></button>
        <section v-for="group in shortcutGroups" :key="group.title" class="shortcut-group">
          <h4>{{ group.title }}</h4>
          <ul>
            <li v-for="item in group.items" :key="item.label + item.keys.join()">
              <span class="shortcut-label">{{ item.label }}</span>
              <span class="shortcut-keys">
                <template v-for="(key, index) in item.keys" :key="key">
                  <i v-if="index" class="shortcut-plus">+</i>
                  <kbd>{{ key }}</kbd>
                </template>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <CanvasGalleryDrawer v-if="galleryOpen" :document="doc" @close="galleryOpen = false" @insert="insertGalleryEntry($event)" @focus="focusNode" />
    </div>

    <input ref="fileInput" class="hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple @change="handleFiles" />

    <CanvasImageEditDialog
      v-if="editTool"
      visible
      :mode="editTool.mode"
      :asset-id="editTool.assetId"
      :file-name="editTool.fileName"
      :busy="editUploading"
      @close="closeEditTool"
      @confirm="handleEditConfirm"
    />

    <el-image-viewer v-if="previewUrl" :url-list="[previewUrl]" teleported hide-on-click-modal @close="closePreview" />

    <el-dialog v-model="describeState.visible" :title="app.t('canvas.imageTools.describeTitle')" width="min(560px, calc(100vw - 32px))" append-to-body>
      <el-input v-model="describeState.prompt" type="textarea" :rows="8" readonly data-testid="canvas-describe-prompt" />
      <template #footer>
        <el-button @click="copyDescribedPrompt">{{ app.t('canvas.imageTools.copy') }}</el-button>
        <el-button type="primary" @click="generateFromDescribedPrompt">{{ app.t('canvas.imageTools.usePrompt') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="consentVisible" :title="app.t('playground.aiConsentTitle')" width="min(480px, calc(100vw - 32px))" @closed="resolveConsent(false)">
      <div class="consent-content">
        <p>{{ app.t('playground.aiConsentDescription') }}</p>
        <a v-if="consentNotice?.url" :href="consentNotice.url" target="_blank" rel="noreferrer">{{ app.t('playground.aiConsentDocument') }}</a>
        <p v-if="consentNotice?.providerCodes.length">{{ app.t('playground.aiConsentProviders') }}: {{ consentNotice.providerCodes.join(', ') }}</p>
      </div>
      <template #footer>
        <el-button :disabled="consentSubmitting" @click="consentVisible = false">{{ app.t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="consentSubmitting" @click="acceptConsent">{{ app.t('playground.aiConsentAccept') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Aim, ArrowLeft, CircleCheck, Close, Compass, FolderAdd, FolderRemove, Loading, Picture, Scissor, WarningFilled,
} from '@element-plus/icons-vue'
import CanvasToolbarIcon from '@/components/canvas/CanvasToolbarIcon.vue'
import CanvasGalleryDrawer from '@/components/canvas/CanvasGalleryDrawer.vue'
import CanvasGeneratePanel from '@/components/canvas/CanvasGeneratePanel.vue'
import CanvasImageEditDialog, { type CanvasImageEditMode } from '@/components/canvas/CanvasImageEditDialog.vue'
import CanvasImageToolbar, { type CanvasImageToolAction } from '@/components/canvas/CanvasImageToolbar.vue'
import CanvasNodeView from '@/components/canvas/CanvasNodeView.vue'
import { ensureModelPricing } from '@/composables/useCanvasGenerationOptions'
import { useCanvasGeneration, type CanvasGenerationResult } from '@/composables/useCanvasGeneration'
import { useCanvasHistory } from '@/composables/useCanvasHistory'
import { useCanvasPersistence } from '@/composables/useCanvasPersistence'
import { getImageRecord, uploadReferenceImage } from '@/services/aiImages'
import { assetContentUrl, assetThumbnailUrl, registerAiResultAsset, renameCanvas } from '@/services/canvases'
import { fetchMediaBlob } from '@/utils/authenticatedMedia'
import { getCurrentLegalDocuments, updateAiProcessingConsent } from '@/services/legal'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'
import { useImageOptionsStore } from '@/stores/imageOptions'
import {
  GALLERY_DRAG_TYPE, GENERATE_NODE_HEIGHT, MAX_GENERATE_INPUTS, NODE_WIDTH, addConnection, addDerivedConnection, canConnect, clampZoom,
  createCanvasId, createGenerateNode, createImageNode, emptyCanvasDocument, findNode, getGenerateInputs, getGroups,
  getInputAssetId, groupNodes, removeConnection, removeNodes, ungroupNodes,
} from '@/utils/canvasDocument'
import type { ApiError } from '@/types/api'
import type {
  CanvasDocument, CanvasGalleryEntry, CanvasGenerateNode, CanvasGenerateNodeData, CanvasNode, CanvasPanelInput, CanvasTextNode,
} from '@/types/canvas'
import type { AiProcessingNotice } from '@/types/legal'

type Interaction =
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  // clickNodeId: a click (no movement) on a member of a selected group narrows the selection to that member.
  | { kind: 'drag'; startX: number; startY: number; origins: Map<string, { x: number; y: number }>; moved: boolean; clickNodeId?: string }
  | { kind: 'resize'; nodeId: string; startX: number; startY: number; width: number; height: number; ratio: number | null }
  | { kind: 'connect'; fromId: string; pointerX: number; pointerY: number }
  | { kind: 'marquee'; startX: number; startY: number; currentX: number; currentY: number; additive: boolean }

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const PANEL_WIDTH = 575
const TOOLBAR_HEIGHT = 42
const GROUP_PADDING = 24
const GROUP_TITLE_SPACE = 24
const DRAG_THRESHOLD = 3
const STANDARD_ASPECTS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']
const MINIMAP_WIDTH = 200
const MINIMAP_HEIGHT = 130
const MINIMAP_STORAGE_KEY = 'canvasMinimapOpen'

const app = useAppStore()
const auth = useAuthStore()
const credits = useCreditsStore()
const optionsStore = useImageOptionsStore()
const route = useRoute()
const router = useRouter()
const canvasId = String(route.params.canvasId || '')

const doc = ref<CanvasDocument>(emptyCanvasDocument())
const titleDraft = ref('')
const savedTitle = ref('')
const loading = ref(true)
const loadError = ref('')
const selected = ref(new Set<string>())
const interaction = ref<Interaction | null>(null)
const connectHoverId = ref('')
const spacePressed = ref(false)
const galleryOpen = ref(false)
const minimapOpen = ref(localStorage.getItem(MINIMAP_STORAGE_KEY) === '1')
// The minimap's scale is frozen while dragging so the bounds (which include the viewport) do not shift under the pointer.
const minimapDrag = ref<{ scale: number; left: number; top: number } | null>(null)
const stage = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const stageSize = ref({ width: 1200, height: 800 })
const optionsReady = ref(false)
const consentVisible = ref(false)
const consentSubmitting = ref(false)
const consentNotice = ref<AiProcessingNotice | null>(null)
const toolBusy = ref<CanvasImageToolAction | null>(null)
const toolbarAnchor = ref<HTMLElement | null>(null)
const toolbarWidth = ref(620)
const editTool = ref<{ mode: CanvasImageEditMode; nodeId: string; assetId: string; fileName: string } | null>(null)
const editUploading = ref(false)
const previewUrl = ref('')
const describeState = reactive({ visible: false, prompt: '', nodeId: '' })
let consentResolver: ((accepted: boolean) => void) | null = null
let toolbarObserver: ResizeObserver | null = null
let uploadConnectsToActive = false
let lastSerialized = ''
let resizeObserver: ResizeObserver | null = null

const persistence = useCanvasPersistence({
  canvasId,
  userId: auth.user?.id ?? null,
  getDocument: () => doc.value,
  applyDocument,
  onLoaded: (detail) => {
    titleDraft.value = detail.title
    savedTitle.value = detail.title
  },
  resolveConflict: async () => {
    try {
      await ElMessageBox.confirm(app.t('canvas.conflictMessage'), app.t('canvas.conflictTitle'), {
        confirmButtonText: app.t('canvas.conflictReload'),
        cancelButtonText: app.t('canvas.conflictOverwrite'),
        distinguishCancelAndClose: true,
        type: 'warning',
      })
      return 'reload'
    } catch (action) {
      return action === 'cancel' ? 'overwrite' : 'reload'
    }
  },
  confirmRestoreDraft: async () => {
    try {
      await ElMessageBox.confirm(app.t('canvas.draftRestoreMessage'), app.t('canvas.draftRestoreTitle'), {
        confirmButtonText: app.t('canvas.draftRestore'),
        cancelButtonText: app.t('canvas.draftDiscard'),
        type: 'info',
      })
      return true
    } catch {
      return false
    }
  },
  onSaveError: (error) => {
    if (error?.status && error.status < 500 && error.status !== 429) ElMessage.error(error.message || app.t('canvas.saveFailed'))
  },
})

const history = useCanvasHistory(() => doc.value, (snapshot) => {
  doc.value.nodes = snapshot.nodes
  doc.value.connections = snapshot.connections
  selected.value = new Set([...selected.value].filter((id) => findNode(doc.value, id)))
})

const generation = useCanvasGeneration({
  getDocument: () => doc.value,
  // Mark synchronously so the following flush() persists the idempotency key before the request is sent.
  markChanged: () => persistence.markChanged(),
  flush: () => persistence.flush(),
  requestConsent,
  onCatalogChanged: async () => {
    await loadOptions()
    optionsStore.options.models.forEach((model) => void ensureModelPricing(model, true))
  },
})

const worldStyle = computed(() => ({
  transform: `translate(${doc.value.viewport.x}px, ${doc.value.viewport.y}px) scale(${doc.value.viewport.zoom})`,
}))
const gridStyle = computed(() => {
  const size = 24 * doc.value.viewport.zoom
  return {
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${doc.value.viewport.x}px ${doc.value.viewport.y}px`,
  }
})
const activeGenerateNode = computed(() => {
  if (selected.value.size !== 1) return null
  const node = findNode(doc.value, [...selected.value][0])
  return node?.type === 'generate' ? node : null
})
const panelInputs = computed<CanvasPanelInput[]>(() => {
  const node = activeGenerateNode.value
  if (!node) return []
  return getGenerateInputs(doc.value, node).map((input, index) => {
    const assetId = getInputAssetId(input)
    return {
      nodeId: input.id,
      label: app.t('canvas.imageLabel').replace('{index}', String(index + 1)),
      assetId,
      thumbnailUrl: assetId ? assetThumbnailUrl(assetId) : '',
    }
  })
})
const inputLabels = computed(() => new Map(panelInputs.value.map((input) => [input.nodeId, input.label])))
const panelStyle = computed(() => {
  const node = activeGenerateNode.value
  if (!node) return {}
  const { x, y, zoom } = doc.value.viewport
  const left = Math.min(Math.max(12, x + node.x * zoom - 150), Math.max(12, stageSize.value.width - PANEL_WIDTH - 12))
  const top = Math.min(y + (node.y + node.height) * zoom + 16, Math.max(12, stageSize.value.height - 260))
  // Whole-pixel left/top keep the floating text crisp; a fractional translate at non-100% zoom blurs it.
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
})
// The image toolbar follows a single selected node that has an image output (uploaded image or chosen generate result).
const toolNode = computed(() => {
  if (selected.value.size !== 1) return null
  const kind = interaction.value?.kind
  if (kind === 'drag' || kind === 'resize' || kind === 'connect') return null
  const node = findNode(doc.value, [...selected.value][0])
  return node && getInputAssetId(node) ? node : null
})
const toolbarStyle = computed(() => {
  const node = toolNode.value
  if (!node) return {}
  const { x, y, zoom } = doc.value.viewport
  const width = toolbarWidth.value
  const centerX = x + (node.x + node.width / 2) * zoom
  const left = Math.min(Math.max(12, centerX - width / 2), Math.max(12, stageSize.value.width - width - 12))
  // Leave room for the node title line rendered above the node.
  const top = Math.max(8, y + node.y * zoom - 24 * zoom - TOOLBAR_HEIGHT - 8)
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
})
const edgePaths = computed(() => doc.value.connections.flatMap((edge) => {
  const from = findNode(doc.value, edge.from)
  const to = findNode(doc.value, edge.to)
  if (!from || !to) return []
  const start = { x: from.x + from.width, y: from.y + from.height / 2 }
  const end = { x: to.x, y: to.y + to.height / 2 }
  return [{
    id: edge.id,
    d: curve(start, end),
    midX: (start.x + end.x) / 2,
    midY: (start.y + end.y) / 2,
    active: selected.value.has(edge.from) || selected.value.has(edge.to),
    // Edges leaving a selected node animate from source to target to show direction.
    flowing: selected.value.has(edge.from),
  }]
}))
const groups = computed(() => getGroups(doc.value))
// The group whose members are exactly the current selection (the group itself is selected, not a member inside it).
const selectedGroupId = computed(() => {
  for (const [groupId, members] of groups.value) {
    if (members.length === selected.value.size && members.every((node) => selected.value.has(node.id))) return groupId
  }
  return ''
})
const groupFrames = computed(() => [...groups.value].map(([groupId, members]) => {
  const bounds = nodeBounds(members)
  return {
    id: groupId,
    x: bounds.left - GROUP_PADDING,
    y: bounds.top - GROUP_PADDING - GROUP_TITLE_SPACE,
    width: bounds.right - bounds.left + GROUP_PADDING * 2,
    height: bounds.bottom - bounds.top + GROUP_PADDING * 2 + GROUP_TITLE_SPACE,
    selected: selectedGroupId.value === groupId,
  }
}))
const groupToolbar = computed(() => {
  const kind = interaction.value?.kind
  if (selected.value.size < 2 || (kind && kind !== 'pan')) return null
  const { x, y, zoom } = doc.value.viewport
  const frame = groupFrames.value.find((group) => group.id === selectedGroupId.value)
  const bounds = frame ? null : nodeBounds(doc.value.nodes.filter((node) => selected.value.has(node.id)))
  const left = frame ? frame.x : bounds!.left
  const top = frame ? frame.y : bounds!.top - GROUP_TITLE_SPACE
  return {
    mode: frame ? 'ungroup' : 'group',
    style: { left: `${Math.round(Math.max(12, x + left * zoom))}px`, top: `${Math.round(Math.max(8, y + top * zoom - 48))}px` },
  }
})
const activeEdges = computed(() => edgePaths.value.filter((edge) => edge.active))
const connectedTargets = computed(() => new Set(doc.value.connections.map((edge) => edge.to)))
const minimapLabel = computed(() => app.t(minimapOpen.value ? 'canvas.minimapClose' : 'canvas.minimapOpen'))
const minimap = computed(() => {
  const nodes = doc.value.nodes
  const { x, y, zoom } = doc.value.viewport
  const view = {
    left: -x / zoom,
    top: -y / zoom,
    right: (stageSize.value.width - x) / zoom,
    bottom: (stageSize.value.height - y) / zoom,
  }
  if (!nodes.length) return null
  const padding = 40
  const left = Math.min(view.left, ...nodes.map((node) => node.x)) - padding
  const top = Math.min(view.top, ...nodes.map((node) => node.y)) - padding
  const right = Math.max(view.right, ...nodes.map((node) => node.x + node.width)) + padding
  const bottom = Math.max(view.bottom, ...nodes.map((node) => node.y + node.height)) + padding
  const fitted = Math.min(MINIMAP_WIDTH / (right - left), MINIMAP_HEIGHT / (bottom - top))
  const frame = minimapDrag.value || {
    scale: fitted,
    left: left - (MINIMAP_WIDTH / fitted - (right - left)) / 2,
    top: top - (MINIMAP_HEIGHT / fitted - (bottom - top)) / 2,
  }
  const project = (box: { x: number; y: number; width: number; height: number }) => ({
    x: (box.x - frame.left) * frame.scale,
    y: (box.y - frame.top) * frame.scale,
    width: Math.max(2, box.width * frame.scale),
    height: Math.max(2, box.height * frame.scale),
  })
  return {
    frame,
    nodes: nodes.map((node) => ({ id: node.id, ...project(node) })),
    view: project({ x: view.left, y: view.top, width: view.right - view.left, height: view.bottom - view.top }),
  }
})
const pendingEdgePath = computed(() => {
  const current = interaction.value
  if (current?.kind !== 'connect') return ''
  const from = findNode(doc.value, current.fromId)
  if (!from) return ''
  return curve({ x: from.x + from.width, y: from.y + from.height / 2 }, { x: current.pointerX, y: current.pointerY })
})
const marquee = computed(() => interaction.value?.kind === 'marquee' ? interaction.value : null)
const marqueeStyle = computed(() => {
  const box = marquee.value
  if (!box) return {}
  return {
    transform: `translate(${Math.min(box.startX, box.currentX)}px, ${Math.min(box.startY, box.currentY)}px)`,
    width: `${Math.abs(box.currentX - box.startX)}px`,
    height: `${Math.abs(box.currentY - box.startY)}px`,
  }
})
const saveStatusText = computed(() => ({
  idle: persistence.dirty.value ? app.t('canvas.unsaved') : app.t('canvas.saved'),
  saving: app.t('canvas.saving'),
  saved: app.t('canvas.saved'),
  error: app.t('canvas.saveFailed'),
  conflict: app.t('canvas.conflictTitle'),
})[persistence.status.value])
const shortcutsOpen = ref(false)
const shortcutsButton = ref<HTMLElement | null>(null)
const shortcutsPanel = ref<HTMLElement | null>(null)

function closeShortcutsOnOutsidePointer(event: PointerEvent) {
  const target = event.target as Node | null
  if (target && (shortcutsPanel.value?.contains(target) || shortcutsButton.value?.contains(target))) return
  shortcutsOpen.value = false
}

watch(shortcutsOpen, (open) => {
  if (open) window.addEventListener('pointerdown', closeShortcutsOnOutsidePointer, true)
  else window.removeEventListener('pointerdown', closeShortcutsOnOutsidePointer, true)
})
onBeforeUnmount(() => window.removeEventListener('pointerdown', closeShortcutsOnOutsidePointer, true))
// Only list shortcuts handled by handleKeydown / pointer handlers / CanvasGeneratePanel.
const shortcutGroups = computed(() => [
  {
    title: app.t('canvas.shortcutGroups.select'),
    items: [
      { label: app.t('canvas.shortcutPan'), keys: ['Space', app.t('canvas.shortcutKeyDrag')] },
      { label: app.t('canvas.shortcutMarquee'), keys: [app.t('canvas.shortcutKeyDrag')] },
      { label: app.t('canvas.shortcutMarqueeAdd'), keys: ['Shift', app.t('canvas.shortcutKeyClick')] },
      { label: app.t('canvas.tools.delete'), keys: ['Delete / Backspace'] },
    ],
  },
  {
    title: app.t('canvas.shortcutGroups.view'),
    items: [
      { label: app.t('canvas.shortcutZoom'), keys: [app.t('canvas.shortcutKeyWheel')] },
      { label: app.t('canvas.tools.fitView'), keys: ['Ctrl', '0'] },
      { label: app.t('canvas.shortcutSelectAll'), keys: ['Ctrl', 'A'] },
    ],
  },
  {
    title: app.t('canvas.shortcutGroups.nodes'),
    items: [
      { label: app.t('canvas.group'), keys: ['Ctrl', 'G'] },
      { label: app.t('canvas.ungroup'), keys: ['Ctrl', 'Shift', 'G'] },
      { label: app.t('canvas.shortcutUpload'), keys: [app.t('canvas.shortcutKeyDropImage')] },
      { label: app.t('canvas.shortcutGenerate'), keys: ['Ctrl', 'Enter'] },
      { label: app.t('canvas.shortcutEscape'), keys: ['Esc'] },
    ],
  },
  {
    title: app.t('canvas.shortcutGroups.history'),
    items: [
      { label: app.t('canvas.tools.undo'), keys: ['Ctrl', 'Z'] },
      { label: app.t('canvas.tools.redo'), keys: ['Ctrl', 'Shift', 'Z'] },
      { label: app.t('canvas.tools.redo'), keys: ['Ctrl', 'Y'] },
    ],
  },
])

// Every structural or viewport edit is persisted; only node/connection edits become undo steps.
watch(doc, () => {
  const serialized = JSON.stringify(doc.value)
  if (serialized === lastSerialized) return
  lastSerialized = serialized
  persistence.markChanged()
  history.schedule()
}, { deep: true })

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  window.addEventListener('paste', handlePaste)
  void credits.fetchSummary().catch(() => undefined)
  void loadOptions()
  try {
    await persistence.load()
    history.reset()
    generation.resumeAll()
    if (doc.value.nodes.length && doc.value.viewport.x === 0 && doc.value.viewport.y === 0 && doc.value.viewport.zoom === 1) fitView()
  } catch (error) {
    const apiError = error as ApiError
    loadError.value = apiError?.status === 404 ? app.t('canvas.notFound') : app.t('canvas.loadFailed')
  } finally {
    loading.value = false
  }
  observeStage()
})

const overlayOpen = computed(() => Boolean(editTool.value || previewUrl.value || describeState.visible))
let overlayJustClosed = false
watch(overlayOpen, (open) => {
  if (open) return
  overlayJustClosed = true
  setTimeout(() => {
    overlayJustClosed = false
  }, 0)
}, { flush: 'sync' })

watch(toolbarAnchor, (element) => {
  toolbarObserver?.disconnect()
  toolbarObserver = null
  if (!element) return
  toolbarObserver = new ResizeObserver(() => {
    toolbarWidth.value = element.offsetWidth || toolbarWidth.value
  })
  toolbarObserver.observe(element)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
  window.removeEventListener('paste', handlePaste)
  stopInteraction()
  resizeObserver?.disconnect()
  toolbarObserver?.disconnect()
  closePreview()
})

onBeforeRouteLeave(async () => {
  await Promise.race([persistence.flush().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000))])
  return true
})

function applyDocument(next: CanvasDocument) {
  lastSerialized = JSON.stringify(next)
  doc.value = next
  selected.value = new Set()
}

function observeStage() {
  if (!stage.value) return
  const update = () => {
    if (!stage.value) return
    stageSize.value = { width: stage.value.clientWidth, height: stage.value.clientHeight }
  }
  update()
  resizeObserver = new ResizeObserver(update)
  resizeObserver.observe(stage.value)
}

async function loadOptions() {
  try {
    await optionsStore.fetchOptions()
    optionsReady.value = optionsStore.modelCapabilitiesReady
  } catch {
    optionsReady.value = false
  }
}

function curve(start: { x: number; y: number }, end: { x: number; y: number }) {
  const offset = Math.max(60, Math.abs(end.x - start.x) / 2)
  return `M ${start.x} ${start.y} C ${start.x + offset} ${start.y}, ${end.x - offset} ${end.y}, ${end.x} ${end.y}`
}

function toggleMinimap() {
  minimapOpen.value = !minimapOpen.value
  localStorage.setItem(MINIMAP_STORAGE_KEY, minimapOpen.value ? '1' : '0')
}

function handleMinimapPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !minimap.value) return
  minimapDrag.value = { ...minimap.value.frame }
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  centerViewportOnMinimap(event)
}

function handleMinimapPointerMove(event: PointerEvent) {
  if (minimapDrag.value) centerViewportOnMinimap(event)
}

function centerViewportOnMinimap(event: PointerEvent) {
  const frame = minimapDrag.value
  if (!frame) return
  const rect = (event.currentTarget as Element).getBoundingClientRect()
  const worldX = frame.left + (event.clientX - rect.left) / frame.scale
  const worldY = frame.top + (event.clientY - rect.top) / frame.scale
  const zoom = doc.value.viewport.zoom
  doc.value.viewport.x = Math.round(stageSize.value.width / 2 - worldX * zoom)
  doc.value.viewport.y = Math.round(stageSize.value.height / 2 - worldY * zoom)
}

function toWorld(clientX: number, clientY: number) {
  const rect = stage.value?.getBoundingClientRect()
  const { x, y, zoom } = doc.value.viewport
  return { x: (clientX - (rect?.left || 0) - x) / zoom, y: (clientY - (rect?.top || 0) - y) / zoom }
}

function viewportCenter() {
  return toWorld(
    (stage.value?.getBoundingClientRect().left || 0) + stageSize.value.width / 2,
    (stage.value?.getBoundingClientRect().top || 0) + stageSize.value.height / 2,
  )
}

function selectOnly(id: string) {
  selected.value = new Set([id])
}

// Left drag on empty canvas box-selects; the middle button or Space + drag pans.
function handleStagePointerDown(event: PointerEvent) {
  if (startPanIfRequested(event)) return
  if (event.button !== 0) return
  const world = toWorld(event.clientX, event.clientY)
  if (!event.shiftKey) selected.value = new Set()
  startInteraction({ kind: 'marquee', startX: world.x, startY: world.y, currentX: world.x, currentY: world.y, additive: event.shiftKey })
}

function startPanIfRequested(event: PointerEvent) {
  if (event.button !== 1 && !(event.button === 0 && spacePressed.value)) return false
  event.preventDefault()
  startInteraction({ kind: 'pan', startX: event.clientX, startY: event.clientY, originX: doc.value.viewport.x, originY: doc.value.viewport.y })
  return true
}

function handleNodePointerDown(node: CanvasNode, event: PointerEvent) {
  event.stopPropagation()
  if (startPanIfRequested(event) || event.button !== 0) return
  const unit = withGroups([node.id])
  if (event.shiftKey) {
    const next = new Set(selected.value)
    const remove = unit.every((id) => next.has(id))
    unit.forEach((id) => (remove ? next.delete(id) : next.add(id)))
    selected.value = next
    return
  }
  let clickNodeId: string | undefined
  if (!selected.value.has(node.id)) selected.value = new Set(unit)
  else if (node.groupId && selectedGroupId.value === node.groupId) clickNodeId = node.id
  startDrag(event, clickNodeId)
}

function handleGroupPointerDown(groupId: string, event: PointerEvent) {
  event.stopPropagation()
  if (startPanIfRequested(event) || event.button !== 0) return
  const members = groups.value.get(groupId)?.map((node) => node.id) || []
  selected.value = new Set([...(event.shiftKey ? selected.value : []), ...members])
  if (!event.shiftKey) startDrag(event)
}

function startDrag(event: PointerEvent, clickNodeId?: string) {
  const origins = new Map(doc.value.nodes.filter((item) => selected.value.has(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]))
  startInteraction({ kind: 'drag', startX: event.clientX, startY: event.clientY, origins, moved: false, clickNodeId })
}

// Expands node ids to whole groups, so picking any member picks its group.
function withGroups(ids: Iterable<string>) {
  const result = new Set<string>()
  for (const id of ids) {
    const node = findNode(doc.value, id)
    if (!node) continue
    if (node.groupId) groups.value.get(node.groupId)?.forEach((member) => result.add(member.id))
    else result.add(id)
  }
  return [...result]
}

function nodeBounds(nodes: CanvasNode[]) {
  return {
    left: Math.min(...nodes.map((node) => node.x)),
    top: Math.min(...nodes.map((node) => node.y)),
    right: Math.max(...nodes.map((node) => node.x + node.width)),
    bottom: Math.max(...nodes.map((node) => node.y + node.height)),
  }
}

function groupSelected() {
  if (groupNodes(doc.value, selected.value)) history.commit()
}

function ungroupSelected() {
  const groupIds = new Set(doc.value.nodes.filter((node) => selected.value.has(node.id) && node.groupId).map((node) => node.groupId!))
  if (!groupIds.size) return
  ungroupNodes(doc.value, groupIds)
  history.commit()
}

function handlePortPointerDown(node: CanvasNode, event: PointerEvent) {
  if (event.button !== 0) return
  const world = toWorld(event.clientX, event.clientY)
  startInteraction({ kind: 'connect', fromId: node.id, pointerX: world.x, pointerY: world.y })
}

function handleResizePointerDown(node: CanvasNode, event: PointerEvent) {
  if (event.button !== 0) return
  startInteraction({
    kind: 'resize',
    nodeId: node.id,
    startX: event.clientX,
    startY: event.clientY,
    width: node.width,
    height: node.height,
    ratio: node.type === 'image' ? node.height / node.width : null,
  })
}

function startInteraction(next: Interaction) {
  interaction.value = next
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
}

function stopInteraction() {
  interaction.value = null
  connectHoverId.value = ''
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
}

function handlePointerMove(event: PointerEvent) {
  const current = interaction.value
  if (!current) return
  const zoom = doc.value.viewport.zoom
  if (current.kind === 'pan') {
    doc.value.viewport.x = current.originX + event.clientX - current.startX
    doc.value.viewport.y = current.originY + event.clientY - current.startY
  } else if (current.kind === 'drag') {
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return
    current.moved = true
    const dx = (event.clientX - current.startX) / zoom
    const dy = (event.clientY - current.startY) / zoom
    doc.value.nodes.forEach((node) => {
      const origin = current.origins.get(node.id)
      if (!origin) return
      node.x = Math.round(origin.x + dx)
      node.y = Math.round(origin.y + dy)
    })
  } else if (current.kind === 'resize') {
    const node = findNode(doc.value, current.nodeId)
    if (!node) return
    const width = Math.max(120, Math.round(current.width + (event.clientX - current.startX) / zoom))
    node.width = Math.min(4000, width)
    node.height = current.ratio
      ? Math.round(node.width * current.ratio)
      : Math.min(4000, Math.max(60, Math.round(current.height + (event.clientY - current.startY) / zoom)))
  } else if (current.kind === 'connect') {
    const world = toWorld(event.clientX, event.clientY)
    current.pointerX = world.x
    current.pointerY = world.y
    const targetId = nodeIdAt(event.clientX, event.clientY)
    connectHoverId.value = targetId && canConnect(doc.value, current.fromId, targetId) ? targetId : ''
  } else if (current.kind === 'marquee') {
    const world = toWorld(event.clientX, event.clientY)
    current.currentX = world.x
    current.currentY = world.y
  }
}

function handlePointerUp(event: PointerEvent) {
  const current = interaction.value
  stopInteraction()
  if (!current) return
  if (current.kind === 'connect') finishConnect(current.fromId, event)
  if (current.kind === 'marquee') {
    const left = Math.min(current.startX, current.currentX)
    const right = Math.max(current.startX, current.currentX)
    const top = Math.min(current.startY, current.currentY)
    const bottom = Math.max(current.startY, current.currentY)
    const hits = doc.value.nodes.filter((node) => node.x < right && node.x + node.width > left && node.y < bottom && node.y + node.height > top)
    selected.value = new Set([...(current.additive ? selected.value : []), ...withGroups(hits.map((node) => node.id))])
  }
  if (current.kind === 'drag' && !current.moved && current.clickNodeId) selectOnly(current.clickNodeId)
  if ((current.kind === 'drag' && current.moved) || current.kind === 'resize') history.commit()
}

function nodeIdAt(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY)
  return (element?.closest('[data-node-id]') as HTMLElement | null)?.dataset.nodeId || ''
}

function finishConnect(fromId: string, event: PointerEvent) {
  const targetId = nodeIdAt(event.clientX, event.clientY)
  if (targetId && targetId !== fromId) {
    if (!addConnection(doc.value, fromId, targetId)) ElMessage.warning(app.t('canvas.connectInvalid'))
    else selectOnly(targetId)
    return
  }
  if (targetId) return
  // Dropping a connection on empty canvas creates a new generate node wired to the source.
  const world = toWorld(event.clientX, event.clientY)
  const node = createGenerateNode(Math.round(world.x), Math.round(world.y - GENERATE_NODE_HEIGHT / 2), defaultGenerateData())
  doc.value.nodes.push(node)
  addConnection(doc.value, fromId, node.id)
  selectOnly(node.id)
}

function handleWheel(event: WheelEvent) {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return
  const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015))
  zoomAt(doc.value.viewport.zoom * factor, event.clientX - rect.left, event.clientY - rect.top)
}

function zoomAt(nextZoom: number, screenX: number, screenY: number) {
  const viewport = doc.value.viewport
  const zoom = clampZoom(nextZoom)
  const worldX = (screenX - viewport.x) / viewport.zoom
  const worldY = (screenY - viewport.y) / viewport.zoom
  viewport.zoom = Number(zoom.toFixed(4))
  viewport.x = Math.round(screenX - worldX * zoom)
  viewport.y = Math.round(screenY - worldY * zoom)
}

function zoomTo(zoom: number) {
  zoomAt(zoom, stageSize.value.width / 2, stageSize.value.height / 2)
}

function fitView() {
  const nodes = doc.value.nodes
  if (!nodes.length) {
    doc.value.viewport = { x: 0, y: 0, zoom: 1 }
    return
  }
  const left = Math.min(...nodes.map((node) => node.x))
  const top = Math.min(...nodes.map((node) => node.y)) - 30
  const right = Math.max(...nodes.map((node) => node.x + node.width))
  const bottom = Math.max(...nodes.map((node) => node.y + node.height))
  const padding = 80
  const zoom = clampZoom(Math.min(
    1,
    (stageSize.value.width - padding * 2) / Math.max(1, right - left),
    (stageSize.value.height - padding * 2 - 200) / Math.max(1, bottom - top),
  ))
  doc.value.viewport = {
    zoom: Number(zoom.toFixed(4)),
    x: Math.round((stageSize.value.width - (right - left) * zoom) / 2 - left * zoom),
    y: Math.round(Math.max(padding, (stageSize.value.height - 200 - (bottom - top) * zoom) / 2) - top * zoom),
  }
}

function focusNode(nodeId: string) {
  const node = findNode(doc.value, nodeId)
  if (!node) return
  const zoom = doc.value.viewport.zoom
  doc.value.viewport.x = Math.round(stageSize.value.width / 2 - (node.x + node.width / 2) * zoom)
  doc.value.viewport.y = Math.round(stageSize.value.height / 3 - (node.y + node.height / 2) * zoom)
  selectOnly(nodeId)
}

// Selects a node and pans to it only when it is not fully visible (its panel needs room below it).
function revealNode(nodeId: string) {
  const node = findNode(doc.value, nodeId)
  if (!node) return
  const { x, y, zoom } = doc.value.viewport
  const left = x + node.x * zoom
  const top = y + node.y * zoom
  const visible = left >= 0 && top >= 60 && left + node.width * zoom <= stageSize.value.width
    && top + node.height * zoom <= stageSize.value.height - 300
  if (visible) selectOnly(nodeId)
  else focusNode(nodeId)
}

function defaultGenerateData(): Partial<CanvasGenerateNodeData> {
  const model = optionsStore.options.models[0]
  return model ? { modelCode: model.value, catalogVersion: model.catalogVersion || null } : {}
}

function addGenerateNode() {
  const center = viewportCenter()
  const node = createGenerateNode(Math.round(center.x - NODE_WIDTH / 2), Math.round(center.y - GENERATE_NODE_HEIGHT), defaultGenerateData())
  doc.value.nodes.push(node)
  selectOnly(node.id)
}

function addTextNode() {
  const center = viewportCenter()
  const node: CanvasTextNode = {
    id: createCanvasId('n'),
    type: 'text',
    x: Math.round(center.x - 110),
    y: Math.round(center.y - 50),
    width: 220,
    height: 100,
    title: null,
    data: { content: '', fontSize: 14 },
  }
  doc.value.nodes.push(node)
  selectOnly(node.id)
}

function updateText(node: CanvasNode, content: string) {
  if (node.type === 'text') node.data.content = content
}

function patchGenerateNode(node: CanvasGenerateNode, patch: Partial<CanvasGenerateNodeData>) {
  Object.assign(node.data, patch)
}

async function selectResult(node: CanvasNode, result: CanvasGenerationResult) {
  if (node.type !== 'generate') return
  await generation.selectPrimary(node.id, result)
}

function disconnect(connectionId: string) {
  removeConnection(doc.value, connectionId)
}

function deleteSelected() {
  if (!selected.value.size) return
  const ids = new Set(selected.value)
  removeNodes(doc.value, ids)
  generation.forget(ids)
  selected.value = new Set()
}

async function clearCanvas() {
  try {
    await ElMessageBox.confirm(app.t('canvas.clearConfirm'), app.t('canvas.tools.clear'), {
      type: 'warning',
      confirmButtonText: app.t('common.confirm'),
      cancelButtonText: app.t('common.cancel'),
    })
  } catch {
    return
  }
  const ids = new Set(doc.value.nodes.map((node) => node.id))
  removeNodes(doc.value, ids)
  generation.forget(ids)
  selected.value = new Set()
}

function cycleBackground() {
  const order = ['lines', 'dots', 'blank'] as const
  doc.value.background = order[(order.indexOf(doc.value.background) + 1) % order.length]
}

function openUpload(connectToActive: boolean) {
  uploadConnectsToActive = connectToActive
  fileInput.value?.click()
}

async function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files || [])]
  input.value = ''
  await uploadFiles(files, null)
}

async function uploadFiles(files: File[], position: { x: number; y: number } | null) {
  const target = uploadConnectsToActive ? activeGenerateNode.value : null
  uploadConnectsToActive = false
  let slots = target ? MAX_GENERATE_INPUTS - doc.value.connections.filter((edge) => edge.to === target.id).length : Infinity
  let offset = 0
  for (const file of files) {
    if (!UPLOAD_TYPES.has(file.type) || file.size > MAX_UPLOAD_BYTES) {
      ElMessage.warning(app.t('canvas.uploadInvalid'))
      continue
    }
    if (target && slots <= 0) {
      ElMessage.warning(app.t('canvas.inputLimit'))
      break
    }
    try {
      const asset = await uploadReferenceImage(file)
      const anchor = position
        || (target ? { x: target.x - NODE_WIDTH - 120, y: target.y + offset } : viewportCenter())
      const node = createImageNode(asset.assetId, Math.round(anchor.x + (position || target ? 0 : offset)), Math.round(anchor.y + (target ? 0 : offset)), {
        title: file.name,
        width: asset.width,
        height: asset.height,
      })
      doc.value.nodes.push(node)
      if (target) {
        addConnection(doc.value, node.id, target.id)
        slots -= 1
      }
      offset += target ? node.height + 40 : 32
    } catch (error) {
      ElMessage.error((error as ApiError)?.message || app.t('canvas.uploadFailed'))
    }
  }
  if (target) selectOnly(target.id)
}

async function insertGalleryEntry(entry: CanvasGalleryEntry, position?: { x: number; y: number }) {
  try {
    const asset = await registerAiResultAsset(entry.taskId, entry.resultOrdinal)
    const anchor = position || viewportCenter()
    const node = createImageNode(asset.assetId, Math.round(anchor.x - NODE_WIDTH / 2), Math.round(anchor.y - 100), {
      title: entry.prompt,
      width: asset.width || entry.width,
      height: asset.height || entry.height,
      sourceTaskId: entry.taskId,
      sourceResultOrdinal: entry.resultOrdinal,
    })
    doc.value.nodes.push(node)
    selectOnly(node.id)
  } catch {
    ElMessage.error(app.t('canvas.registerFailed'))
  }
}

function handleDrop(event: DragEvent) {
  const world = toWorld(event.clientX, event.clientY)
  const raw = event.dataTransfer?.getData(GALLERY_DRAG_TYPE)
  if (raw) {
    try {
      void insertGalleryEntry(JSON.parse(raw) as CanvasGalleryEntry, world)
    } catch {
      // Ignore drags that did not originate from the gallery drawer.
    }
    return
  }
  const files = [...(event.dataTransfer?.files || [])]
  if (files.length) void uploadFiles(files, world)
}

function handlePaste(event: ClipboardEvent) {
  if (isEditableTarget(event.target) || toolOverlayOpen()) return
  const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  void uploadFiles(files, null)
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return Boolean(element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable))
}

// Canvas shortcuts (Delete, Ctrl+Z, Space, Escape) must not act on nodes behind an open tool dialog,
// including the keystroke that just closed it.
function toolOverlayOpen() {
  return overlayOpen.value || overlayJustClosed
}

function handleKeydown(event: KeyboardEvent) {
  if (isEditableTarget(event.target) || consentVisible.value || toolOverlayOpen()) return
  const modifier = event.ctrlKey || event.metaKey
  if (event.code === 'Space') {
    spacePressed.value = true
    event.preventDefault()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelected()
  } else if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) history.redo()
    else history.undo()
  } else if (modifier && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    history.redo()
  } else if (modifier && event.key.toLowerCase() === 'g') {
    event.preventDefault()
    if (event.shiftKey) ungroupSelected()
    else groupSelected()
  } else if (modifier && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selected.value = new Set(doc.value.nodes.map((node) => node.id))
  } else if (modifier && event.key === '0') {
    event.preventDefault()
    fitView()
  } else if (event.key === 'Escape') {
    selected.value = new Set()
    shortcutsOpen.value = false
  }
}

function handleKeyup(event: KeyboardEvent) {
  if (event.code === 'Space') spacePressed.value = false
}

function sourceTaskId(node: CanvasNode) {
  if (node.type === 'image') return node.data.sourceTaskId || null
  if (node.type === 'generate') return node.data.primaryResult?.taskId || null
  return null
}

function toolFileName(node: CanvasNode) {
  if (node.title?.trim()) return node.title.trim()
  const taskId = sourceTaskId(node)
  return taskId ? `canvas-${taskId}` : 'canvas-image'
}

async function runImageTool(action: CanvasImageToolAction) {
  const node = toolNode.value
  const assetId = node ? getInputAssetId(node) : ''
  if (!node || !assetId || toolBusy.value) return
  if (action === 'crop' || action === 'mark' || action === 'slice') {
    editTool.value = { mode: action, nodeId: node.id, assetId, fileName: toolFileName(node) }
    return
  }
  if (action === 'cutout' || action === 'upscale') {
    createDerivedGenerateNode(node, action)
    return
  }
  toolBusy.value = action
  try {
    if (action === 'download') await downloadAsset(assetId, toolFileName(node))
    else if (action === 'preview') await openPreview(assetId)
    else if (action === 'describe') await describeNode(node)
  } finally {
    toolBusy.value = null
  }
}

async function downloadAsset(assetId: string, fileName: string) {
  try {
    const blob = await fetchMediaBlob(assetContentUrl(assetId))
    const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.startsWith('image/') ? blob.type.slice(6) : 'png'
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?"<>|]+/g, '_')}.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    ElMessage.error(app.t('canvas.imageTools.downloadFailed'))
  }
}

async function openPreview(assetId: string) {
  try {
    const blob = await fetchMediaBlob(assetContentUrl(assetId))
    closePreview()
    previewUrl.value = URL.createObjectURL(blob)
  } catch {
    ElMessage.error(app.t('canvas.imageTools.loadFailed'))
  }
}

function closePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

// Reverse prompting is limited to AI results: the original task prompt is the only description the backend holds.
async function describeNode(node: CanvasNode) {
  const taskId = sourceTaskId(node)
  if (!taskId) return
  try {
    const record = await getImageRecord(taskId)
    const prompt = record?.prompt?.trim() || ''
    if (!prompt) {
      ElMessage.info(app.t('canvas.imageTools.describeEmpty'))
      return
    }
    Object.assign(describeState, { visible: true, prompt, nodeId: node.id })
  } catch {
    ElMessage.error(app.t('canvas.imageTools.describeFailed'))
  }
}

async function copyDescribedPrompt() {
  try {
    await navigator.clipboard.writeText(describeState.prompt)
    ElMessage.success(app.t('canvas.imageTools.copied'))
  } catch {
    ElMessage.error(app.t('canvas.imageTools.copyFailed'))
  }
}

function generateFromDescribedPrompt() {
  const source = findNode(doc.value, describeState.nodeId)
  const anchor = source || { x: viewportCenter().x, y: viewportCenter().y, width: 0 }
  const spot = findFreeSpot(anchor.x + anchor.width + 120, anchor.y, NODE_WIDTH, GENERATE_NODE_HEIGHT)
  const node = createGenerateNode(spot.x, spot.y, { ...defaultGenerateData(), prompt: describeState.prompt })
  doc.value.nodes.push(node)
  describeState.visible = false
  revealNode(node.id)
}

// Cutout and upscale run through the normal generate pipeline: a prefilled node wired to the source, billed only when the user generates.
function createDerivedGenerateNode(source: CanvasNode, action: 'cutout' | 'upscale') {
  const label = app.t('canvas.imageLabel').replace('{index}', '1')
  const prompt = app.t(`canvas.imageTools.${action}Prompt`).replace('{image}', label)
  const aspectRatioCode = source.type === 'generate' ? source.data.aspectRatioCode || nearestAspect(source.width, source.height) : nearestAspect(source.width, source.height)
  const spot = findFreeSpot(source.x + source.width + 120, source.y, NODE_WIDTH, GENERATE_NODE_HEIGHT)
  const node = createGenerateNode(spot.x, spot.y, {
    ...defaultGenerateData(),
    prompt,
    aspectRatioCode,
    ...(action === 'upscale' ? { resolutionCode: '4k' } : {}),
  })
  doc.value.nodes.push(node)
  addConnection(doc.value, source.id, node.id)
  revealNode(node.id)
  ElMessage.info(app.t(`canvas.imageTools.${action}Created`))
}

function nearestAspect(width: number, height: number) {
  const target = Math.log(width / Math.max(1, height))
  const distance = (code: string) => {
    const [w, h] = code.split(':').map(Number)
    return Math.abs(Math.log(w / h) - target)
  }
  return STANDARD_ASPECTS.reduce((best, code) => distance(code) < distance(best) ? code : best)
}

// Moves a block placed beside a source node downwards until it no longer overlaps existing nodes (titles included).
function findFreeSpot(x: number, y: number, width: number, height: number) {
  const gap = 40
  let top = y
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const blocker = doc.value.nodes.find((node) => node.x < x + width + gap && node.x + node.width + gap > x
      && node.y - gap < top + height && node.y + node.height + gap > top)
    if (!blocker) break
    top = blocker.y + blocker.height + gap
  }
  return { x: Math.round(x), y: Math.round(top) }
}

function closeEditTool() {
  if (!editUploading.value) editTool.value = null
}

// Uploads crop / mark / slice output as new assets and places them to the right of the source node.
async function handleEditConfirm(payload: { files: File[]; rows: number; cols: number }) {
  const tool = editTool.value
  if (!tool || editUploading.value) return
  const tiled = tool.mode === 'slice'
  const tileWidth = payload.cols <= 2 ? 200 : 150
  const nodes: CanvasNode[] = []
  editUploading.value = true
  try {
    for (const file of payload.files) {
      const asset = await uploadReferenceImage(file)
      const node = createImageNode(asset.assetId, 0, 0, { title: file.name, width: asset.width, height: asset.height })
      if (tiled) {
        node.height = Math.max(40, Math.round(node.height * tileWidth / node.width))
        node.width = tileWidth
      }
      nodes.push(node)
    }
  } catch (error) {
    ElMessage.error((error as ApiError)?.message || app.t('canvas.uploadFailed'))
  } finally {
    editUploading.value = false
  }
  if (!nodes.length) return
  // Lay the pieces out as a grid (a single result is a 1×1 grid), then drop the whole block into free space.
  const cols = tiled ? payload.cols : 1
  const rowHeights: number[] = []
  nodes.forEach((node, index) => {
    const row = Math.floor(index / cols)
    rowHeights[row] = Math.max(rowHeights[row] || 0, node.height)
  })
  const blockWidth = Math.min(cols, nodes.length) * (nodes[0].width + 20) - 20
  const blockHeight = rowHeights.reduce((sum, height) => sum + height + 40, -40)
  const source = findNode(doc.value, tool.nodeId)
  const spot = findFreeSpot(
    (source ? source.x + source.width : viewportCenter().x) + 120,
    source ? source.y : viewportCenter().y,
    blockWidth,
    blockHeight,
  )
  nodes.forEach((node, index) => {
    const row = Math.floor(index / cols)
    node.x = spot.x + (index % cols) * (node.width + 20)
    node.y = spot.y + rowHeights.slice(0, row).reduce((sum, height) => sum + height + 40, 0)
  })
  doc.value.nodes.push(...nodes)
  if (source) nodes.forEach((node) => addDerivedConnection(doc.value, source.id, node.id))
  selected.value = new Set(nodes.map((node) => node.id))
  // Slice tiles start as one group so they move together; ungrouping splits them.
  if (tiled) groupNodes(doc.value, selected.value)
  if (nodes.length === payload.files.length) {
    editTool.value = null
    ElMessage.success(app.t('canvas.imageTools.resultAdded'))
  }
}

async function commitTitle() {
  const title = titleDraft.value.trim()
  if (!title || title.length > 100) {
    titleDraft.value = savedTitle.value
    return
  }
  if (title === savedTitle.value) return
  try {
    const updated = await renameCanvas(canvasId, title)
    savedTitle.value = updated.title
    titleDraft.value = updated.title
  } catch (error) {
    titleDraft.value = savedTitle.value
    ElMessage.error((error as ApiError)?.message || app.t('canvas.renameFailed'))
  }
}

async function goBack() {
  await router.push({ name: 'canvas' })
}

async function openRecharge() {
  await persistence.flush().catch(() => undefined)
  await router.push({ name: 'recharge' })
}

async function requestConsent() {
  try {
    const documents = await getCurrentLegalDocuments(app.locale)
    const notice = documents?.aiProcessingNotice
    if (!notice?.version || !notice.url || !notice.providerCodes?.length) throw new Error('AI processing notice is incomplete')
    consentNotice.value = notice
  } catch {
    ElMessage.error(app.t('playground.aiConsentUnavailable'))
    return false
  }
  consentVisible.value = true
  return new Promise<boolean>((resolve) => {
    consentResolver = resolve
  })
}

async function acceptConsent() {
  const notice = consentNotice.value
  if (!notice) return
  consentSubmitting.value = true
  try {
    await updateAiProcessingConsent({ accepted: true, documentVersion: notice.version, providerCodes: notice.providerCodes, clientPlatform: 'web' })
    resolveConsent(true)
    consentVisible.value = false
  } catch {
    ElMessage.error(app.t('playground.aiConsentFailed'))
  } finally {
    consentSubmitting.value = false
  }
}

function resolveConsent(accepted: boolean) {
  const resolver = consentResolver
  consentResolver = null
  resolver?.(accepted)
}
</script>

<style scoped>
.canvas-editor {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text);
}

.editor-header {
  z-index: 30;
  display: flex;
  height: 52px;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.header-back {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font-size: 18px;
  cursor: pointer;
}

.header-back:hover {
  background: var(--color-primary-soft);
}

.title-input {
  width: min(360px, 50vw);
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 17px;
  font-weight: 700;
  outline: none;
}

.title-input:hover,
.title-input:focus {
  border-color: var(--color-border);
}

.header-spacer {
  flex: 1;
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.save-status.is-saved {
  color: var(--color-primary);
}

.save-status.is-error,
.save-status.is-conflict {
  color: var(--color-danger);
}

.editor-load-error {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.editor-stage {
  position: relative;
  flex: 1;
  overflow: hidden;
  cursor: default;
  touch-action: none;
}

.editor-stage.is-panning {
  cursor: grab;
}

.stage-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bg-lines .stage-grid {
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--canvas-accent) 8%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--canvas-accent) 8%, transparent) 1px, transparent 1px);
}

.bg-dots .stage-grid {
  background-image: radial-gradient(circle, rgba(35, 37, 31, 0.18) 1px, transparent 1.5px);
}

.world {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}

.connections {
  position: absolute;
  top: 0;
  left: 0;
  overflow: visible;
  pointer-events: none;
}

.connection-path {
  fill: none;
  stroke: var(--canvas-accent);
  stroke-width: 2;
  opacity: 0.75;
}

.connection-path.active {
  stroke-width: 3;
  opacity: 1;
}

.connection-path.pending {
  stroke-dasharray: 6 6;
}

.connection-flow {
  fill: none;
  stroke: var(--color-surface);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 4 12;
  animation: connection-flow 0.8s linear infinite;
}

/* A negative offset moves the dashes from the path start (source) towards its end (target). */
@keyframes connection-flow {
  to {
    stroke-dashoffset: -16;
  }
}

@media (prefers-reduced-motion: reduce) {
  .connection-flow {
    animation: none;
  }
}

.connection-cut {
  position: absolute;
  top: 0;
  left: 0;
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  opacity: 0.85;
}

.connection-cut:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
  opacity: 1;
}

.marquee {
  position: absolute;
  top: 0;
  left: 0;
  border: 1px dashed var(--canvas-accent);
  background: color-mix(in srgb, var(--canvas-accent) 8%, transparent);
  pointer-events: none;
}

.group-frame {
  position: absolute;
  top: 0;
  left: 0;
  border: 1px solid color-mix(in srgb, var(--canvas-accent) 30%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--canvas-accent) 5%, transparent);
  cursor: grab;
}

.group-frame.selected {
  border: 1.5px solid var(--canvas-accent);
  background: color-mix(in srgb, var(--canvas-accent) 9%, transparent);
}

.group-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 16;
  display: flex;
  gap: 6px;
}

.group-toolbar button {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.group-toolbar button:hover {
  border-color: var(--canvas-accent);
  color: var(--canvas-accent);
}

.panel-anchor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 15;
}

.image-toolbar-anchor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 16;
}

.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  pointer-events: none;
}

.corner-controls,
.toolbar {
  position: absolute;
  bottom: 16px;
  z-index: 18;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.corner-controls {
  left: 16px;
}

.corner-controls.with-drawer,
.minimap.with-drawer {
  left: 296px;
}

.minimap {
  position: absolute;
  bottom: 70px;
  left: 16px;
  z-index: 18;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.minimap svg {
  display: block;
  cursor: pointer;
  touch-action: none;
}

.minimap-node {
  fill: color-mix(in srgb, var(--canvas-accent) 55%, transparent);
}

.minimap-node.selected {
  fill: var(--canvas-accent);
}

.minimap-view {
  fill: color-mix(in srgb, var(--canvas-accent) 8%, transparent);
  stroke: var(--canvas-accent);
  stroke-width: 1.5;
}

.toolbar {
  left: 50%;
  transform: translateX(-50%);
}

.corner-controls button,
.toolbar button {
  display: inline-flex;
  min-width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font-size: 16px;
  cursor: pointer;
}

.corner-controls button span {
  font-size: 12px;
}

.corner-controls button:hover,
.toolbar button:hover:not(:disabled),
.corner-controls button.active {
  background: var(--color-primary-soft);
}

.toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.toolbar button.danger {
  color: var(--color-danger);
}

.zoom-text {
  font-size: 12px !important;
}

.control-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--color-border);
}

.toolbar button.active {
  background: var(--color-primary-soft);
}

.shortcut-panel {
  position: absolute;
  bottom: 72px;
  left: 50%;
  z-index: 19;
  display: grid;
  width: max-content;
  max-width: calc(100% - 32px);
  max-height: calc(100% - 110px);
  overflow: auto;
  grid-template-columns: repeat(4, max-content);
  padding: 26px 52px 26px 6px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  transform: translateX(-50%);
}

.shortcut-group {
  min-width: 220px;
  padding: 0 22px;
  border-left: 1px solid var(--color-border);
}

.shortcut-group:first-of-type {
  border-left: 0;
}

.shortcut-group h4 {
  margin: 0 0 18px;
  color: var(--canvas-accent);
  font-size: 15px;
  font-weight: 700;
}

.shortcut-group ul {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.shortcut-group li {
  display: flex;
  min-height: 30px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.shortcut-label {
  color: var(--color-text-muted);
  font-size: 14px;
  white-space: nowrap;
}

.shortcut-keys {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.shortcut-keys kbd {
  min-width: 30px;
  padding: 4px 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  box-shadow: 0 1px 0 var(--color-border);
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
}

.shortcut-plus {
  color: var(--color-text-muted);
  font-size: 11px;
  font-style: normal;
}

.shortcut-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 18px;
  cursor: pointer;
}

.shortcut-close:hover {
  background: var(--color-primary-soft);
  color: var(--color-text);
}

@media (max-width: 1240px) {
  .shortcut-panel {
    grid-template-columns: repeat(2, max-content);
    row-gap: 24px;
  }

  .shortcut-group:nth-of-type(odd) {
    border-left: 0;
  }
}

@media (max-width: 640px) {
  .shortcut-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .shortcut-group {
    border-left: 0;
  }
}

.hidden-file-input {
  display: none;
}

.consent-content {
  display: grid;
  gap: 10px;
}
</style>
