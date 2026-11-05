import type {
  CanvasConnection,
  CanvasDocument,
  CanvasGenerateNode,
  CanvasImageNode,
  CanvasNode,
} from '@/types/canvas'

export const MAX_GENERATE_INPUTS = 6
export const MAX_GENERATION_RUNS = 20
export const NODE_WIDTH = 276
export const GENERATE_NODE_HEIGHT = 155
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export const GALLERY_DRAG_TYPE = 'application/x-jokester-canvas-gallery'

export function createCanvasId(prefix: 'n' | 'e' | 'g') {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 16)
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${random}`
}

export function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `canvas-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function emptyCanvasDocument(): CanvasDocument {
  return { schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 }, background: 'lines', nodes: [], connections: [] }
}

export function normalizeCanvasDocument(raw: Partial<CanvasDocument> | null | undefined): CanvasDocument {
  const base = emptyCanvasDocument()
  if (!raw || typeof raw !== 'object') return base
  return {
    schemaVersion: 1,
    viewport: {
      x: Number(raw.viewport?.x) || 0,
      y: Number(raw.viewport?.y) || 0,
      zoom: clampZoom(Number(raw.viewport?.zoom) || 1),
    },
    background: raw.background === 'dots' || raw.background === 'blank' ? raw.background : 'lines',
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    connections: Array.isArray(raw.connections) ? raw.connections : [],
  }
}

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function cloneDocument(document: CanvasDocument): CanvasDocument {
  return JSON.parse(JSON.stringify(document)) as CanvasDocument
}

export function findNode(document: CanvasDocument, id: string) {
  return document.nodes.find((node) => node.id === id)
}

// Ordered upstream inputs of a generate node: explicit inputOrder first, then any other connected sources.
export function getGenerateInputs(document: CanvasDocument, node: CanvasGenerateNode): CanvasNode[] {
  const connected = document.connections.filter((edge) => edge.to === node.id).map((edge) => edge.from)
  const ordered = [...(node.data.inputOrder || []).filter((id) => connected.includes(id)), ...connected]
  return [...new Set(ordered)]
    .map((id) => findNode(document, id))
    .filter((item): item is CanvasNode => Boolean(item))
}

export function getInputAssetId(node: CanvasNode) {
  if (node.type === 'image') return node.data.assetId
  if (node.type === 'generate') return node.data.primaryResult?.assetId || ''
  return ''
}

export function canConnect(document: CanvasDocument, from: string, to: string) {
  if (from === to) return false
  const source = findNode(document, from)
  const target = findNode(document, to)
  if (!source || !target || target.type !== 'generate' || source.type === 'text') return false
  if (document.connections.some((edge) => edge.from === from && edge.to === to)) return false
  if (document.connections.filter((edge) => edge.to === to).length >= MAX_GENERATE_INPUTS) return false
  return !reaches(document, to, from)
}

function reaches(document: CanvasDocument, start: string, target: string) {
  const stack = [start]
  const seen = new Set<string>()
  while (stack.length) {
    const current = stack.pop()!
    if (current === target) return true
    if (seen.has(current)) continue
    seen.add(current)
    document.connections.filter((edge) => edge.from === current).forEach((edge) => stack.push(edge.to))
  }
  return false
}

export function addConnection(document: CanvasDocument, from: string, to: string): CanvasConnection | null {
  if (!canConnect(document, from, to)) return null
  const connection = { id: createCanvasId('e'), from, to }
  document.connections.push(connection)
  const target = findNode(document, to)
  if (target?.type === 'generate') {
    target.data.inputOrder = [...(target.data.inputOrder || []).filter((id) => id !== from), from]
  }
  return connection
}

// Derived images (slice / crop / mark output) keep a single link back to the node they were cut from.
// Users cannot draw these by hand; canConnect still only allows generate targets.
export function addDerivedConnection(document: CanvasDocument, from: string, to: string): CanvasConnection | null {
  const source = findNode(document, from)
  const target = findNode(document, to)
  if (!source || !target || from === to || source.type === 'text' || target.type !== 'image') return null
  if (document.connections.some((edge) => edge.to === to) || reaches(document, to, from)) return null
  const connection = { id: createCanvasId('e'), from, to }
  document.connections.push(connection)
  return connection
}

export function removeConnection(document: CanvasDocument, connectionId: string) {
  const connection = document.connections.find((edge) => edge.id === connectionId)
  if (!connection) return
  document.connections = document.connections.filter((edge) => edge.id !== connectionId)
  const target = findNode(document, connection.to)
  if (target?.type === 'generate') {
    target.data.inputOrder = (target.data.inputOrder || []).filter((id) => id !== connection.from)
  }
}

export function removeNodes(document: CanvasDocument, ids: Set<string>) {
  document.nodes = document.nodes.filter((node) => !ids.has(node.id))
  document.connections = document.connections.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to))
  document.nodes.forEach((node) => {
    if (node.type === 'generate' && node.data.inputOrder?.length) {
      node.data.inputOrder = node.data.inputOrder.filter((id) => !ids.has(id))
    }
  })
  pruneGroups(document)
}

export function getGroups(document: CanvasDocument) {
  const groups = new Map<string, CanvasNode[]>()
  document.nodes.forEach((node) => {
    if (node.groupId) groups.set(node.groupId, [...(groups.get(node.groupId) || []), node])
  })
  return groups
}

// Puts the nodes into one new group; nodes already grouped leave their old group.
export function groupNodes(document: CanvasDocument, ids: Set<string>) {
  const members = document.nodes.filter((node) => ids.has(node.id))
  if (members.length < 2) return null
  const groupId = createCanvasId('g')
  members.forEach((node) => {
    node.groupId = groupId
  })
  pruneGroups(document)
  return groupId
}

export function ungroupNodes(document: CanvasDocument, groupIds: Set<string>) {
  document.nodes.forEach((node) => {
    if (node.groupId && groupIds.has(node.groupId)) delete node.groupId
  })
}

// A group needs at least two members; leftovers after deletes or regrouping become plain nodes.
function pruneGroups(document: CanvasDocument) {
  getGroups(document).forEach((members) => {
    if (members.length < 2) members.forEach((node) => delete node.groupId)
  })
}

export function imageNodeSize(width?: number | null, height?: number | null) {
  if (!width || !height || width <= 0 || height <= 0) return { width: NODE_WIDTH, height: NODE_WIDTH }
  return { width: NODE_WIDTH, height: Math.max(80, Math.min(NODE_WIDTH * 3, Math.round(NODE_WIDTH * height / width))) }
}

export function createImageNode(assetId: string, x: number, y: number, options: {
  title?: string
  width?: number | null
  height?: number | null
  sourceTaskId?: number | null
  sourceResultOrdinal?: number | null
} = {}): CanvasImageNode {
  const size = imageNodeSize(options.width, options.height)
  return {
    id: createCanvasId('n'),
    type: 'image',
    x,
    y,
    ...size,
    title: options.title?.slice(0, 200) || null,
    data: {
      assetId,
      ...(options.sourceTaskId ? { sourceTaskId: options.sourceTaskId, sourceResultOrdinal: options.sourceResultOrdinal ?? 0 } : {}),
    },
  }
}

export function createGenerateNode(x: number, y: number, defaults: Partial<CanvasGenerateNode['data']> = {}): CanvasGenerateNode {
  return {
    id: createCanvasId('n'),
    type: 'generate',
    x,
    y,
    width: NODE_WIDTH,
    height: GENERATE_NODE_HEIGHT,
    title: null,
    data: { prompt: '', imageCount: 1, inputOrder: [], runs: [], primaryResult: null, ...defaults },
  }
}

export function formatStorageSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function readTaskIds(result: unknown): number[] {
  if (!result || typeof result !== 'object') return []
  const source = result as Record<string, unknown>
  const candidates = [source.taskIds, source.ids, source.taskId, source.id]
  for (const candidate of candidates) {
    const values = (Array.isArray(candidate) ? candidate : [candidate])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
    if (values.length) return [...new Set(values)]
  }
  return []
}
