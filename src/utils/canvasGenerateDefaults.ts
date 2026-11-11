import type { CanvasGenerateNodeData } from '@/types/canvas'
import type { ImageParameterOption } from '@/types/image'

// Generation parameters a new generate node inherits. imageCount is deliberately excluded so a new node
// never silently starts with a multi-image (multi-charge) setting; catalogVersion always comes from the live model.
export type RememberedGenerateParams = Pick<CanvasGenerateNodeData, 'modelCode' | 'sizeMode' | 'resolutionCode' | 'qualityCode' | 'aspectRatioCode'>

const STORAGE_PREFIX = 'canvasLastGenerateParams'

function storageKey(userId: string | number | null | undefined) {
  return `${STORAGE_PREFIX}:${userId ?? 'anonymous'}`
}

function readString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

export function pickGenerateParams(data: Partial<CanvasGenerateNodeData> | null | undefined): RememberedGenerateParams {
  return {
    modelCode: data?.modelCode || null,
    sizeMode: data?.sizeMode || null,
    resolutionCode: data?.resolutionCode || null,
    qualityCode: data?.qualityCode || null,
    aspectRatioCode: data?.aspectRatioCode || null,
  }
}

export function loadGenerateParams(userId: string | number | null | undefined): RememberedGenerateParams | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sizeMode = parsed.sizeMode === 'auto' || parsed.sizeMode === 'explicit' ? parsed.sizeMode : null
    const params: RememberedGenerateParams = {
      modelCode: readString(parsed.modelCode),
      sizeMode,
      resolutionCode: readString(parsed.resolutionCode),
      qualityCode: readString(parsed.qualityCode),
      aspectRatioCode: readString(parsed.aspectRatioCode),
    }
    return params.modelCode ? params : null
  } catch {
    return null
  }
}

export function saveGenerateParams(userId: string | number | null | undefined, data: Partial<CanvasGenerateNodeData>) {
  const params = pickGenerateParams(data)
  if (!params.modelCode) return
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(params))
  } catch {
    // Storage may be full or disabled; falling back to model defaults is acceptable.
  }
}

// Builds the starting data of a new generate node: the source generate node's parameters when branching from one,
// otherwise the user's last explicit choice, otherwise the first model. Values the model no longer supports are
// corrected later by the panel's reconcile step.
export function resolveGenerateDefaults(
  models: ImageParameterOption[],
  remembered: RememberedGenerateParams | null,
  source?: Partial<CanvasGenerateNodeData> | null,
): Partial<CanvasGenerateNodeData> {
  const preferred = [source ? pickGenerateParams(source) : null, remembered]
  for (const params of preferred) {
    const model = params?.modelCode ? models.find((item) => item.value === params.modelCode) : undefined
    if (params && model) return { ...params, catalogVersion: model.catalogVersion || null }
  }
  const first = models[0]
  return first ? { modelCode: first.value, catalogVersion: first.catalogVersion || null } : {}
}
