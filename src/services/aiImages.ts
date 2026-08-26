import { http } from './http'
import type { AxiosRequestConfig } from 'axios'
import type { PageQuery, PageResult } from '@/types/api'
import type {
  AiImagePointPrice,
  AiImagePricingEnvelope,
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

const SIZE_MODE_CAPABILITY_CONFIG: AxiosRequestConfig = {
  headers: { 'X-Client-Capabilities': 'ai-size-mode-v1' },
}

export function getImageParameters() {
  return http.get<unknown, ImageParametersResponse>('/ai/images/parameters')
}

export function getImageModels() {
  return http.get<unknown, ImageParameterApiOption[]>('/ai/images/models', SIZE_MODE_CAPABILITY_CONFIG)
}

export function getPricingOptions(modelCode?: string, catalogVersion?: string) {
  const usesSizeModeV1 = Boolean(modelCode && catalogVersion)
  return http.get<unknown, AiImagePointPrice[] | AiImagePricingEnvelope>('/ai/images/pricing-options', usesSizeModeV1
    ? {
        ...SIZE_MODE_CAPABILITY_CONFIG,
        params: { modelCode, catalogVersion },
      }
    : undefined)
}

export function resolveImageParameters(payload: ResolveImageParametersRequest) {
  return http.post<unknown, ResolveImageParametersResponse>(
    '/ai/images/parameters/resolve',
    payload,
    payload.sizeMode ? SIZE_MODE_CAPABILITY_CONFIG : undefined,
  )
}

export function generateImage(payload: CreateImageTaskRequest) {
  return createImageTask(payload)
}

export function createImageTask(payload: CreateImageTaskRequest) {
  return http.post<unknown, ImageTaskCreationResult>(
    '/ai/images',
    payload,
    payload.sizeMode ? SIZE_MODE_CAPABILITY_CONFIG : undefined,
  )
}

export function generateGptImageDirect(payload: CreateImageTaskRequest) {
  return http.post<unknown, GeneratedImageResult>(
    '/ai/images/generate',
    payload,
    payload.sizeMode ? SIZE_MODE_CAPABILITY_CONFIG : undefined,
  )
}

export function generateNanoBananaImageDirect(payload: NanoBananaImageRequest) {
  return http.post<unknown, GeneratedImageResult>('/ai/images/nanoBananaImage/generate', payload)
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

export function getImageRecords(params: ImageRecordsQuery, config: AxiosRequestConfig = {}) {
  return http.get<unknown, PageResult<ImageRecord>>('/ai/images', { ...config, params })
}

export function favoriteImageRecord(id: string | number, imageUrl: string, isFavorite: boolean) {
  return http.post<unknown, null>(`/ai/images/${id}/favorite`, { imageUrl, isFavorite })
}

export function getImageRecord(id: string | number) {
  return http.get<unknown, ImageRecord | null>(`/ai/images/${id}`)
}

export function deleteImageRecord(id: string | number) {
  return http.delete<unknown, null>(`/ai/images/${id}`)
}

export function uploadReferenceImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  return http.post<unknown, UploadReferenceImageResult>('/ai/images/upload', form)
}
