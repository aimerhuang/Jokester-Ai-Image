import type { ImageSizeMode } from './image'

export type CanvasBackground = 'lines' | 'dots' | 'blank'
export type CanvasNodeType = 'image' | 'text' | 'generate'

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasImageNodeData {
  assetId: string
  sourceTaskId?: number | null
  sourceResultOrdinal?: number | null
}

export interface CanvasTextNodeData {
  content?: string
  fontSize?: number
}

export interface CanvasGenerationRun {
  idempotencyKey: string
  taskIds: number[]
  createdAt: string
}

export interface CanvasPrimaryResult {
  taskId: number
  resultOrdinal: number
  assetId?: string | null
}

export interface CanvasGenerateNodeData {
  prompt?: string
  modelCode?: string | null
  catalogVersion?: string | null
  sizeMode?: ImageSizeMode | null
  resolutionCode?: string | null
  qualityCode?: string | null
  aspectRatioCode?: string | null
  imageCount?: number
  inputOrder?: string[]
  pendingIdempotencyKey?: string | null
  runs?: CanvasGenerationRun[]
  primaryResult?: CanvasPrimaryResult | null
}

interface CanvasNodeBase<TType extends CanvasNodeType, TData> {
  id: string
  type: TType
  x: number
  y: number
  width: number
  height: number
  title?: string | null
  // Nodes sharing a groupId form one group; groups are not stored separately.
  groupId?: string | null
  data: TData
}

export type CanvasImageNode = CanvasNodeBase<'image', CanvasImageNodeData>
export type CanvasTextNode = CanvasNodeBase<'text', CanvasTextNodeData>
export type CanvasGenerateNode = CanvasNodeBase<'generate', CanvasGenerateNodeData>
export type CanvasNode = CanvasImageNode | CanvasTextNode | CanvasGenerateNode

export interface CanvasConnection {
  id: string
  from: string
  to: string
}

export interface CanvasDocument {
  schemaVersion: 1
  viewport: CanvasViewport
  background: CanvasBackground
  nodes: CanvasNode[]
  connections: CanvasConnection[]
}

export interface CanvasSummary {
  canvasId: string
  title: string
  coverAssetId?: string | null
  coverUrl?: string | null
  storageBytes: number
  nodeCount: number
  connectionCount: number
  revision: number
  createdAt: string
  updatedAt: string
}

export interface CanvasDetail extends CanvasSummary {
  schemaVersion: number
  document: CanvasDocument
}

export interface CanvasPageResult {
  items: CanvasSummary[]
  total: number
  pageIndex: number
  pageSize: number
  hasMore?: boolean
  totalStorageBytes: number
}

export interface SaveCanvasDocumentResult {
  revision: number
  updatedAt: string
  storageBytes: number
  nodeCount: number
  connectionCount: number
  coverAssetId?: string | null
  coverUrl?: string | null
}

export interface CanvasPanelInput {
  nodeId: string
  label: string
  assetId: string
  thumbnailUrl: string
}

export interface CanvasGalleryEntry {
  taskId: number
  resultOrdinal: number
  url: string
  prompt: string
  meta: string
  width?: number
  height?: number
}
