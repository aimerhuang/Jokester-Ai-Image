import type { ImageSizeMode } from '@/types/image'

const STORAGE_KEY = 'pendingAiImageHistoryRecovery'
const STORAGE_VERSION = 2

export interface ImageTaskHistoryRecovery {
  version: number
  ownerUserId: number
  startedAt: number
  expiresAt: number
  prompt: string
  modelKeys: string[]
  imageCount: number
  sizeContractVersion: string | null
  sizeMode: ImageSizeMode | null
  resolutionCode: string
  qualityCode: string
  aspectRatioCode: string
  referenceCount: number
  sourcePromptId: number | null
  baselineCaptured: boolean
  baselineTaskIds: string[]
}

export type ImageTaskHistoryRecoveryContext = Pick<
  ImageTaskHistoryRecovery,
  | 'prompt'
  | 'modelKeys'
  | 'imageCount'
  | 'sizeContractVersion'
  | 'sizeMode'
  | 'resolutionCode'
  | 'qualityCode'
  | 'aspectRatioCode'
  | 'referenceCount'
  | 'sourcePromptId'
  | 'baselineCaptured'
  | 'baselineTaskIds'
>

export function startImageTaskHistoryRecovery(
  ownerUserId: number,
  startedAt: number,
  durationMs: number,
  context: ImageTaskHistoryRecoveryContext,
): ImageTaskHistoryRecovery {
  const recovery = {
    version: STORAGE_VERSION,
    ownerUserId,
    startedAt,
    expiresAt: startedAt + durationMs,
    prompt: context.prompt,
    modelKeys: [...new Set(context.modelKeys.filter(Boolean))],
    imageCount: context.imageCount,
    sizeContractVersion: context.sizeContractVersion,
    sizeMode: context.sizeMode,
    resolutionCode: context.resolutionCode,
    qualityCode: context.qualityCode,
    aspectRatioCode: context.aspectRatioCode,
    referenceCount: context.referenceCount,
    sourcePromptId: context.sourcePromptId,
    baselineCaptured: context.baselineCaptured,
    baselineTaskIds: [...new Set(context.baselineTaskIds)],
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(recovery))
  } catch {
    // The current page can still continue with the in-memory result.
  }
  return recovery
}

export function readImageTaskHistoryRecovery(ownerUserId: number | null): ImageTaskHistoryRecovery | null {
  if (!ownerUserId) return null
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as Partial<ImageTaskHistoryRecovery> | null
    if (!parsed
      || ![1, STORAGE_VERSION].includes(Number(parsed.version))
      || parsed.ownerUserId !== ownerUserId
      || !Number.isFinite(parsed.startedAt)
      || !Number.isFinite(parsed.expiresAt)
      || Number(parsed.expiresAt) <= Number(parsed.startedAt)
      || typeof parsed.prompt !== 'string'
      || !Array.isArray(parsed.modelKeys)
      || !parsed.modelKeys.length
      || parsed.modelKeys.some((item) => typeof item !== 'string' || !item)
      || !Number.isInteger(parsed.imageCount)
      || Number(parsed.imageCount) < 1
      || !(parsed.sizeContractVersion === undefined || parsed.sizeContractVersion === null || typeof parsed.sizeContractVersion === 'string')
      || !(parsed.sizeMode === undefined || parsed.sizeMode === null || parsed.sizeMode === 'explicit' || parsed.sizeMode === 'auto')
      || typeof parsed.resolutionCode !== 'string'
      || typeof parsed.qualityCode !== 'string'
      || typeof parsed.aspectRatioCode !== 'string'
      || !Number.isInteger(parsed.referenceCount)
      || Number(parsed.referenceCount) < 0
      || !(parsed.sourcePromptId === null || (Number.isInteger(parsed.sourcePromptId) && Number(parsed.sourcePromptId) > 0))
      || typeof parsed.baselineCaptured !== 'boolean'
      || !Array.isArray(parsed.baselineTaskIds)
      || parsed.baselineTaskIds.some((item) => typeof item !== 'string' || !item)) {
      clearImageTaskHistoryRecovery()
      return null
    }
    return {
      version: STORAGE_VERSION,
      ownerUserId,
      startedAt: Number(parsed.startedAt),
      expiresAt: Number(parsed.expiresAt),
      prompt: parsed.prompt,
      modelKeys: [...parsed.modelKeys],
      imageCount: Number(parsed.imageCount),
      sizeContractVersion: typeof parsed.sizeContractVersion === 'string' ? parsed.sizeContractVersion : null,
      sizeMode: parsed.sizeMode === 'explicit' || parsed.sizeMode === 'auto' ? parsed.sizeMode : null,
      resolutionCode: parsed.resolutionCode,
      qualityCode: parsed.qualityCode,
      aspectRatioCode: parsed.aspectRatioCode,
      referenceCount: Number(parsed.referenceCount),
      sourcePromptId: parsed.sourcePromptId === null ? null : Number(parsed.sourcePromptId),
      baselineCaptured: parsed.baselineCaptured,
      baselineTaskIds: [...parsed.baselineTaskIds],
    }
  } catch {
    clearImageTaskHistoryRecovery()
    return null
  }
}

export function clearImageTaskHistoryRecovery() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage cleanup is best-effort when browser storage is unavailable.
  }
}
