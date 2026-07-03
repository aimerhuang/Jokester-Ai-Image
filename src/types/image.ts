export type ResolutionCode = string
export type QualityCode = string
export type AspectRatioCode = string

export interface ImageParameterOption {
  code?: string
  name?: string
  label: string
  value: string
  providerValue?: string
  valueInt1?: number
  valueInt2?: number
  sort?: number
}

export interface ImageParameterApiOption {
  code?: string
  name?: string
  label?: string
  value?: string
  providerValue?: string
  valueInt1?: number
  valueInt2?: number
  sort?: number
}

export interface ImageParameters {
  models?: ImageParameterOption[]
  resolutions?: ImageParameterOption[]
  qualities?: ImageParameterOption[]
  aspectRatios?: ImageParameterOption[]
}

export interface ImageParametersResponse {
  models?: ImageParameterApiOption[]
  resolutions?: ImageParameterApiOption[]
  qualities?: ImageParameterApiOption[]
  aspectRatios?: ImageParameterApiOption[]
}

export interface GenerateImageRequest {
  prompt: string
  modelName?: string
  resolutionCode: ResolutionCode
  qualityCode: QualityCode
  aspectRatioCode: AspectRatioCode
  referenceImageUrls?: string[]
}

export interface CreateImageTaskRequest extends GenerateImageRequest {
  siteId?: number
  negativePrompt?: string | null
  modelName?: string
  imageCount: number
}

export interface GeneratedImageResult {
  id?: number | string
  taskId?: number | string
  modelName?: string
  prompt: string
  resolutionCode: ResolutionCode
  qualityCode: QualityCode
  aspectRatioCode: AspectRatioCode
  width?: number
  height?: number
  size?: string
  quality?: string
  mimeType?: string
  url?: string
  imageUrl?: string
  image_url?: string
  fileUrl?: string
  file_url?: string
  base64?: string
  dataUrl?: string
  resultUrls?: string[] | string
  result_urls?: string[] | string
  imageUrls?: string[] | string
  image_urls?: string[] | string
  urls?: string[] | string
  images?: Array<string | { url?: string; imageUrl?: string; image_url?: string; fileUrl?: string; file_url?: string }> | string
  status?: string | number
  errorMessage?: string
  revisedPrompt?: string
  createdAt?: string
}

export interface ImageRecord extends GeneratedImageResult {
  referenceImageUrls?: string[]
  imageCount?: number
  favorite?: boolean
  isFavorite?: boolean
}

export interface AiImagePricingOption {
  modelCode: string
  modelName: string
  resolutionCode: string
  resolutionName: string
  qualityCode: string
  qualityName: string
  points: number
  priceAmount: number
  currency: string
  sort: number
}
