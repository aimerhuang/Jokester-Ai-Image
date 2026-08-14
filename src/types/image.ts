export type ResolutionCode = string
export type QualityCode = string
export type AspectRatioCode = string
export type ImageTaskStatus = 0 | 1 | 2 | 3
export type ImageTaskState = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
export type ImageBillingStatus = 0 | 1 | 2 | 3

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
}

export interface ImageModelCapabilities {
  supportsReferenceImages: boolean
  maxReferenceImages: number
  supportsQuality: boolean
  supportedImageCounts: number[]
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
}

export interface AiImagePointPrice {
  modelCode: string
  resolutionCode: string
  qualityCode: string
  points: number
  priceAmount: number
  currency: string
  sort: number
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
  resolutionCode: ResolutionCode
  qualityCode: QualityCode
  aspectRatioCode: AspectRatioCode
  referenceImageUrls?: string[]
}

export interface ResolveImageParametersResponse {
  resolutionCode: ResolutionCode
  qualityCode: QualityCode
  aspectRatioCode: AspectRatioCode
  width: number
  height: number
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
  resolutionCode: ResolutionCode
  qualityCode: QualityCode
  aspectRatioCode: AspectRatioCode
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
}

export interface GeneratedImageResult {
  id?: number | string
  taskId?: number | string
  sourcePromptId?: number | null
  modelName?: string
  modelCode?: string
  providerModel?: string
  prompt?: string
  resolutionCode?: ResolutionCode
  qualityCode?: QualityCode
  aspectRatioCode?: AspectRatioCode
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
  resolutionCode: ResolutionCode
  qualityCode: QualityCode
  aspectRatioCode: AspectRatioCode
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
