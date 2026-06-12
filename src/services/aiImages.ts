import { http } from './http'
import type { PageQuery, PageResult } from '@/types/api'
import type { CreateImageTaskRequest, ImageParameterApiOption, ImageParametersResponse, ImageRecord } from '@/types/image'

interface NanoBananaImageRequest {
  prompt: string
  modelName?: string
  resolutionCode: string
  aspectRatioCode: string
  imageCount: number
  imageUrls: string[]
}

export function getImageParameters() {
  return http.get<unknown, ImageParametersResponse>('/ai/images/parameters')
}

export function getImageModels() {
  return http.get<unknown, ImageParameterApiOption[]>('/ai/images/models')
}

export function getPricingOptions() {
  return http.get<unknown, unknown>('/ai/images/pricing-options')
}

export function resolveImageParameters(payload: Partial<CreateImageTaskRequest>) {
  return http.post<unknown, unknown>('/ai/images/parameters/resolve', payload)
}

export function generateImage(payload: CreateImageTaskRequest) {
  if (isNanoBananaModel(payload.modelName)) {
    return generateNanoBananaImage(payload)
  }

  return createImageTask(payload)
}

export function generateNanoBananaImage(payload: CreateImageTaskRequest) {
  const request: NanoBananaImageRequest = {
    prompt: payload.prompt,
    modelName: payload.modelName,
    resolutionCode: payload.resolutionCode,
    aspectRatioCode: payload.aspectRatioCode || 'auto',
    imageCount: payload.imageCount,
    imageUrls: payload.referenceImageUrls || [],
  }

  return http.post<unknown, ImageRecord>('/ai/images/nanoBananaImage', request)
}

export function isNanoBananaModel(modelName: string | undefined) {
  const normalized = modelName?.toLowerCase().replace(/[\s_-]+/g, '')
  return normalized === 'nanobanana' || normalized === 'nanobanana2' || normalized === 'nanobananapro'
}

// 后端出图数量上限：Nano Banana(Gemini 2.5 Flash Image) 单次最多 4 张；GPT Image(OpenAI Images API n) 最多 10 张。
export function getMaxImageCount(modelName: string | undefined) {
  return isNanoBananaModel(modelName) ? 4 : 10
}

export function createImageTask(payload: CreateImageTaskRequest) {
  return http.post<unknown, ImageRecord>('/ai/images', payload)
}

interface ImageRecordsQuery extends PageQuery {
  isFavorite?: boolean
  prompt?: string
  modelName?: string
  startDate?: string
  endDate?: string
}

export function getImageRecords(params: ImageRecordsQuery) {
  return http.get<unknown, PageResult<ImageRecord> | ImageRecord[]>('/ai/images', { params })
}

interface FavoriteImageRecordPayload {
  imageUrl: string
  isFavorite: boolean
}

export function favoriteImageRecord(id: string | number, payload: FavoriteImageRecordPayload) {
  return http.post<unknown, ImageRecord | { favorite?: boolean; isFavorite?: boolean } | null>(`/ai/images/${id}/favorite`, payload)
}

export function getImageRecord(id: string | number) {
  return http.get<unknown, ImageRecord>(`/ai/images/${id}`)
}

export function deleteImageRecord(id: string | number) {
  return http.delete<unknown, null>(`/ai/images/${id}`)
}

export function uploadReferenceImage(file: File) {
  const form = new FormData()
  form.append('File', file)
  return http.post<unknown, { url: string }>('/ai/images/upload', form)
}
