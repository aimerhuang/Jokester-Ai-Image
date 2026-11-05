import { http } from './http'
import type { PageQuery } from '@/types/api'
import type { CanvasDetail, CanvasDocument, CanvasPageResult, CanvasSummary, SaveCanvasDocumentResult } from '@/types/canvas'
import type { UploadReferenceImageResult } from '@/types/image'

export function getCanvases(params: PageQuery = {}) {
  return http.get<unknown, CanvasPageResult>('/ai/canvases', { params })
}

export function createCanvas(title?: string) {
  return http.post<unknown, CanvasDetail>('/ai/canvases', title ? { title } : {})
}

export function getCanvas(canvasId: string) {
  return http.get<unknown, CanvasDetail>(`/ai/canvases/${encodeURIComponent(canvasId)}`)
}

export function saveCanvasDocument(canvasId: string, baseRevision: number, document: CanvasDocument) {
  return http.put<unknown, SaveCanvasDocumentResult>(
    `/ai/canvases/${encodeURIComponent(canvasId)}/document`,
    { baseRevision, document },
  )
}

export function renameCanvas(canvasId: string, title: string) {
  return http.patch<unknown, CanvasSummary>(`/ai/canvases/${encodeURIComponent(canvasId)}`, { title })
}

export function deleteCanvas(canvasId: string) {
  return http.delete<unknown, null>(`/ai/canvases/${encodeURIComponent(canvasId)}`)
}

// Registers a generated result as a reusable asset; the backend returns the same assetId for repeated calls.
export function registerAiResultAsset(taskId: number, resultOrdinal: number) {
  return http.post<unknown, UploadReferenceImageResult>('/assets/from-ai-result', { taskId, resultOrdinal })
}

export function assetThumbnailUrl(assetId: string) {
  return `/api/assets/${encodeURIComponent(assetId)}/thumbnail`
}

export function assetContentUrl(assetId: string) {
  return `/api/assets/${encodeURIComponent(assetId)}/content`
}
