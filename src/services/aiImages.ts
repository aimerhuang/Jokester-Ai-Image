import { http } from './http'
import type { PageQuery, PageResult } from '@/types/api'
import type {
  AiImagePointPrice,
  CreateImageTaskRequest,
  GeneratedImageResult,
  ImageParameterApiOption,
  ImageParametersResponse,
  ImageRecord,
  ImageTaskCreationResult,
  NanoBananaImageRequest,
  ResolveImageParametersRequest,
  ResolveImageParametersResponse,
  UploadReferenceImageResult,
} from '@/types/image'

export function getImageParameters() {
  return http.get<unknown, ImageParametersResponse>('/ai/images/parameters')
}

export function getImageModels() {
  return http.get<unknown, ImageParameterApiOption[]>('/ai/images/models')
}

export function getPricingOptions() {
  return http.get<unknown, AiImagePointPrice[]>('/ai/images/pricing-options')
}

export function resolveImageParameters(payload: ResolveImageParametersRequest) {
  return http.post<unknown, ResolveImageParametersResponse>('/ai/images/parameters/resolve', payload)
}

export function generateImage(payload: CreateImageTaskRequest) {
  return isNanoBananaModel(payload.modelCode)
    ? createNanoBananaImageTask(toNanoBananaRequest(payload))
    : createImageTask(payload)
}

export function createImageTask(payload: CreateImageTaskRequest) {
  return http.post<unknown, ImageTaskCreationResult>('/ai/images', payload)
}

export function createNanoBananaImageTask(payload: NanoBananaImageRequest) {
  return http.post<unknown, ImageTaskCreationResult>('/ai/images/nanoBananaImage', payload)
}

export function generateGptImageDirect(payload: CreateImageTaskRequest) {
  return http.post<unknown, GeneratedImageResult>('/ai/images/generate', payload)
}

export function generateNanoBananaImageDirect(payload: NanoBananaImageRequest) {
  return http.post<unknown, GeneratedImageResult>('/ai/images/nanoBananaImage/generate', payload)
}

function toNanoBananaRequest(payload: CreateImageTaskRequest): NanoBananaImageRequest {
  return {
    idempotencyKey: payload.idempotencyKey,
    sourcePromptId: payload.sourcePromptId,
    prompt: payload.prompt,
    modelCode: payload.modelCode,
    modelName: payload.modelName,
    resolutionCode: payload.resolutionCode,
    aspectRatioCode: payload.aspectRatioCode || 'auto',
    imageCount: payload.imageCount,
    imageUrls: payload.referenceImageUrls,
    imageAssetIds: payload.referenceAssetIds,
  }
}

export function isNanoBananaModel(modelCode: string | undefined) {
  const normalized = modelCode?.toLowerCase().replace(/[\s_-]+/g, '')
  return normalized === 'nanobanana' || normalized === 'nanobanana2' || normalized === 'nanobananapro'
}

// Keep the product-level frontend limit at four images per task.
export function getMaxImageCount(_modelCode: string | undefined) {
  return 4
}

export interface ImageRecordsQuery extends PageQuery {
  status?: number
  isFavorite?: boolean
  prompt?: string
  modelName?: string
  startDate?: string
  endDate?: string
}

export function getImageRecords(params: ImageRecordsQuery) {
  return http.get<unknown, PageResult<ImageRecord>>('/ai/images', { params })
}

export function favoriteImageRecord(id: string | number, imageUrl: string, isFavorite: boolean) {
  return http.post<unknown, null>(`/ai/images/${id}/favorite`, { imageUrl, isFavorite })
}

export function getImageRecord(id: string | number) {
  return http.get<unknown, ImageRecord>(`/ai/images/${id}`)
}

export function deleteImageRecord(id: string | number) {
  return http.delete<unknown, null>(`/ai/images/${id}`)
}

export function uploadReferenceImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  return http.post<unknown, UploadReferenceImageResult>('/ai/images/upload', form)
}
