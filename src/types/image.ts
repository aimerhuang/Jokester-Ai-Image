export type ResolutionCode = string
export type QualityCode = string
export type AspectRatioCode = string
export type ImageSizeMode = 'explicit' | 'auto'
export type ImageSizeContractVersion = 'size-mode-v1' | 'legacy-explicit-v1' | 'legacy-aspect-auto' | 'legacy-unknown'
export type ImageTaskStatus = 0 | 1 | 2 | 3
export type ImageTaskState = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
export type ImageBillingStatus = 0 | 1 | 2 | 3
export type ImageRequestState = 'active' | 'partially_deleted' | 'deleted'
export type ImageBatchStatus = 'processing' | 'succeeded' | 'partial' | 'failed'

export interface ImageParameterOption {
  code?: string
  name?: string
  label: string
  value: string
  providerValue?: string | null
  valueInt1?: number | null
  valueInt2?: number | null
  sort?: number
  provider?: string
  providerCode?: string
  capabilities?: ImageModelCapabilities
  resolutions?: string[]
  qualities?: string[]
  aspectRatios?: string[]
  sizeContractVersion?: ImageSizeContractVersion | string
  catalogVersion?: string
}

export interface ImageModelCapabilities {
  supportsReferenceImages: boolean
  maxReferenceImages: number
  supportsQuality: boolean
  supportedImageCounts: number[]
  sizeModes?: ImageSizeMode[]
  defaultSizeMode?: ImageSizeMode
  supportsAutoSize?: boolean
}

export interface ImageParameterApiOption {
  code: string
  name: string
  provider?: string
  providerValue?: string | null
  valueInt1?: number | null
  valueInt2?: number | null
  sort: number
  providerCode?: string
  capabilities?: ImageModelCapabilities
  resolutions?: string[]
  qualities?: string[]
  aspectRatios?: string[]
  sizeContractVersion?: ImageSizeContractVersion | string
  catalogVersion?: string
}

export interface AiImagePointPrice {
  modelCode: string
  sizeMode?: ImageSizeMode
  resolutionCode: string | null
  qualityCode: string
  points: number
  priceAmount: number
  priceMinorUnits?: number
  currency: string
  sort: number
}

export interface AiImagePricingEnvelope {
  modelCode: string
  catalogVersion: string
  items: AiImagePointPrice[]
}

export interface ImageParameters {
  models: ImageParameterOption[]
  resolutions: ImageParameterOption[]
  qualities: ImageParameterOption[]
  aspectRatios: ImageParameterOption[]
  pointPrices: AiImagePointPrice[]
}

export interface ImageParametersResponse {
  resolutions: ImageParameterApiOption[]
  qualities: ImageParameterApiOption[]
  aspectRatios: ImageParameterApiOption[]
  pointPrices: AiImagePointPrice[]
}

export interface ResolveImageParametersRequest {
  modelCode?: string
  sizeMode?: ImageSizeMode
  catalogVersion?: string
  resolutionCode?: ResolutionCode | null
  qualityCode: QualityCode
  aspectRatioCode?: AspectRatioCode | null
  referenceImageUrls?: string[]
}

export interface ResolveImageParametersResponse {
  modelCode?: string
  sizeMode?: ImageSizeMode
  catalogVersion?: string
  requestedSize?: string
  resolutionCode: ResolutionCode | null
  qualityCode: QualityCode
  aspectRatioCode: AspectRatioCode | null
  width: number | null
  height: number | null
  size: string
  providerQuality: string
}

export interface CreateImageTaskRequest {
  idempotencyKey: string
  sourcePromptId?: number
  prompt: string
  modelCode: string
  modelName?: string
  imageCount: number
  sizeMode?: ImageSizeMode
  catalogVersion?: string
  resolutionCode?: ResolutionCode | null
  qualityCode?: QualityCode
  aspectRatioCode?: AspectRatioCode | null
  referenceImageUrls: string[]
  referenceAssetIds: string[]
  negativePrompt?: string | null
  maskImageUrl?: string | null
  maskAssetId?: string | null
}

export interface NanoBananaImageRequest {
  idempotencyKey: string
  sourcePromptId?: number
  prompt: string
  modelCode: string
  modelName?: string
  resolutionCode: ResolutionCode
  aspectRatioCode: AspectRatioCode
  size?: string
  imageCount: number
  imageUrls: string[]
  imageAssetIds: string[]
}

export interface AiImageTaskAsset {
  url: string
}

export interface UploadReferenceImageResult {
  assetId: string
  url: string
  thumbnailUrl: string
  fileName: string
  mimeType: string
  fileSize: number
  sizeBytes?: number
  width?: number
  height?: number
  metadataStripped?: boolean
  createdAt?: string
}

export interface ImageTaskCreationResult extends Partial<GeneratedImageResult> {
  id: number
  ids?: number[]
  taskIds?: number[]
  requestState?: ImageRequestState
}

export interface GeneratedImageBatchItem {
  ordinal: number
  taskId: number | string
  status: Exclude<ImageTaskState, 'cancelled'>
  isDeleted: boolean
  url?: string | null
  outputWidth?: number | null
  outputHeight?: number | null
  outputSize?: string | null
  mimeType?: string | null
  failureCode?: string | null
  failureStage?: string | null
  retryable?: boolean | null
  refundedPoints?: number | null
}

export interface GeneratedImageResult {
  id?: number | string
  taskId?: number | string
  sourcePromptId?: number | null
  modelName?: string
  modelCode?: string
  providerModel?: string
  prompt?: string
  sizeContractVersion?: ImageSizeContractVersion | string
  sizeMode?: ImageSizeMode | null
  catalogVersion?: string | null
  requestedSize?: string | null
  requestedResolutionCode?: ResolutionCode | null
  requestedAspectRatioCode?: AspectRatioCode | null
  requestedWidth?: number | null
  requestedHeight?: number | null
  outputWidth?: number | null
  outputHeight?: number | null
  outputSize?: string | null
  resolutionCode?: ResolutionCode | null
  qualityCode?: QualityCode
  aspectRatioCode?: AspectRatioCode | null
  width?: number
  height?: number
  size?: string
  quality?: string
  mimeType?: string
  url?: string
  base64?: string
  dataUrl?: string
  urls?: string[] | string
  resultUrls?: string[] | string
  imageUrls?: string[] | string
  referenceImageUrls?: string[]
  maskImageUrl?: string | null
  status?: ImageTaskStatus | ImageTaskState
  statusCode?: ImageTaskStatus
  progress?: number
  pollAfterSeconds?: number
  expiresAt?: string
  errorMessage?: string | null
  failureCode?: string | null
  failureStage?: string | null
  retryable?: boolean | null
  refundedPoints?: number | null
  requestState?: ImageRequestState
  batchStatus?: ImageBatchStatus
  isDeleted?: boolean
  results?: GeneratedImageBatchItem[]
  revisedPrompt?: string | null
  createdAt?: string
  updatedAt?: string | null
  imageUrl?: string
  image_url?: string
  fileUrl?: string
  file_url?: string
  result_urls?: string[] | string
  image_urls?: string[] | string
  images?: Array<string | { url?: string; imageUrl?: string; image_url?: string; fileUrl?: string; file_url?: string }> | string
  assets?: Array<string | AiImageTaskAsset>
}

export interface ImageRecord extends GeneratedImageResult {
  id: number
  siteId: number
  prompt: string
  modelName: string
  imageCount: number
  completedImageCount: number
  pointCost: number
  billingStatus: ImageBillingStatus
  resolutionCode: ResolutionCode | null
  qualityCode: QualityCode
  aspectRatioCode: AspectRatioCode | null
  width: number
  height: number
  size: string
  quality: string
  referenceImageUrls: string[]
  resultUrls: string[]
  favoriteUrls: string[]
  isFavorite: boolean
  status: ImageTaskStatus | ImageTaskState
  errorMessage?: string | null
  createdAt: string
  updatedAt?: string | null
  favorite?: boolean
}

export interface AiImagePricingOption extends AiImagePointPrice {
  modelName: string
  resolutionName: string
  qualityName: string
}
