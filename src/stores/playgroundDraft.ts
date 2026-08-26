import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ImageSizeMode } from '@/types/image'

const DRAFT_STORAGE_KEY = 'playgroundDraft'
const DRAFT_STORAGE_VERSION = 2

export interface PlaygroundReferenceDraft {
  url: string
  assetId: string
}

export interface PlaygroundDraftSnapshot {
  prompt: string
  modelCode: string
  resolutionCode: string
  qualityCode: string
  aspectRatioCode: string
  sizeContractVersion: string | null
  sizeMode: ImageSizeMode | null
  catalogVersion: string
  lastExplicitResolutionCode: string
  lastExplicitAspectRatioCode: string
  imageCount: number
  sourcePromptId?: number
  references: PlaygroundReferenceDraft[]
}

interface StoredPlaygroundDraft {
  version: number
  ownerUserId: number | null
  manualPrompt: string
  draft: PlaygroundDraftSnapshot
}

function emptyDraft(): PlaygroundDraftSnapshot {
  return {
    prompt: '',
    modelCode: '',
    resolutionCode: '',
    qualityCode: '',
    aspectRatioCode: '',
    sizeContractVersion: null,
    sizeMode: null,
    catalogVersion: '',
    lastExplicitResolutionCode: '',
    lastExplicitAspectRatioCode: '',
    imageCount: 1,
    sourcePromptId: undefined,
    references: [],
  }
}

export const usePlaygroundDraftStore = defineStore('playgroundDraft', () => {
  const manualPrompt = ref('')
  const draft = ref<PlaygroundDraftSnapshot>(emptyDraft())
  const ownerUserId = ref<number | null>(null)
  const needsMigration = ref(false)
  let hydrated = false

  function activateForUser(userId: number | null) {
    hydrate()
    if (ownerUserId.value !== userId) {
      ownerUserId.value = userId
      manualPrompt.value = ''
      draft.value = emptyDraft()
      needsMigration.value = false
      persist()
    }
    return manualPrompt.value
  }

  function saveManualPrompt(userId: number | null, prompt: string) {
    activateForUser(userId)
    manualPrompt.value = prompt
    persist()
  }

  function clearManualPrompt(userId: number | null) {
    activateForUser(userId)
    manualPrompt.value = ''
    persist()
  }

  function getDraft(userId: number | null): PlaygroundDraftSnapshot {
    activateForUser(userId)
    const prompt = manualPrompt.value
    return {
      ...draft.value,
      prompt,
      sourcePromptId: prompt && prompt === draft.value.prompt
        ? draft.value.sourcePromptId
        : undefined,
      references: draft.value.references.map((item) => ({ ...item })),
    }
  }

  function saveDraft(userId: number | null, value: PlaygroundDraftSnapshot, migrationComplete = true) {
    activateForUser(userId)
    draft.value = {
      ...value,
      references: value.references.map((item) => ({ ...item })),
    }
    if (!value.sourcePromptId) manualPrompt.value = value.prompt
    if (migrationComplete) needsMigration.value = false
    persist()
  }

  function hydrate() {
    if (hydrated || typeof sessionStorage === 'undefined') return
    hydrated = true
    try {
      const parsed = JSON.parse(sessionStorage.getItem(DRAFT_STORAGE_KEY) || 'null') as Partial<StoredPlaygroundDraft> | null
      if (!parsed || ![1, DRAFT_STORAGE_VERSION].includes(Number(parsed.version)) || !parsed.draft) return
      ownerUserId.value = typeof parsed.ownerUserId === 'number' ? parsed.ownerUserId : null
      manualPrompt.value = typeof parsed.manualPrompt === 'string' ? parsed.manualPrompt : ''
      draft.value = normalizeDraft(parsed.draft)
      needsMigration.value = Number(parsed.version) === 1
    } catch {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  }

  function persist() {
    if (typeof sessionStorage === 'undefined') return
    try {
      const value: StoredPlaygroundDraft = {
        version: needsMigration.value ? 1 : DRAFT_STORAGE_VERSION,
        ownerUserId: ownerUserId.value,
        manualPrompt: manualPrompt.value,
        draft: {
          ...draft.value,
          references: draft.value.references.map((item) => ({ ...item })),
        },
      }
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value))
    } catch {
      // Draft persistence is best-effort when browser storage is unavailable.
    }
  }

  return { manualPrompt, draft, needsMigration, activateForUser, saveManualPrompt, clearManualPrompt, getDraft, saveDraft }
})

function normalizeDraft(value: Partial<PlaygroundDraftSnapshot>): PlaygroundDraftSnapshot {
  const imageCount = Number(value.imageCount)
  return {
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    modelCode: typeof value.modelCode === 'string' ? value.modelCode : '',
    resolutionCode: typeof value.resolutionCode === 'string' ? value.resolutionCode : '',
    qualityCode: typeof value.qualityCode === 'string' ? value.qualityCode : '',
    aspectRatioCode: typeof value.aspectRatioCode === 'string' ? value.aspectRatioCode.trim() : '',
    sizeContractVersion: typeof value.sizeContractVersion === 'string' && value.sizeContractVersion.trim()
      ? value.sizeContractVersion.trim()
      : null,
    sizeMode: value.sizeMode === 'explicit' || value.sizeMode === 'auto' ? value.sizeMode : null,
    catalogVersion: typeof value.catalogVersion === 'string' ? value.catalogVersion.trim() : '',
    lastExplicitResolutionCode: typeof value.lastExplicitResolutionCode === 'string'
      ? value.lastExplicitResolutionCode.trim()
      : typeof value.resolutionCode === 'string' ? value.resolutionCode.trim() : '',
    lastExplicitAspectRatioCode: typeof value.lastExplicitAspectRatioCode === 'string'
      ? value.lastExplicitAspectRatioCode.trim()
      : value.aspectRatioCode && value.aspectRatioCode !== 'auto' ? value.aspectRatioCode.trim() : '',
    imageCount: Number.isInteger(imageCount) ? Math.min(4, Math.max(1, imageCount)) : 1,
    sourcePromptId: Number.isInteger(value.sourcePromptId) && Number(value.sourcePromptId) > 0
      ? Number(value.sourcePromptId)
      : undefined,
    references: Array.isArray(value.references)
      ? value.references
        .filter((item): item is PlaygroundReferenceDraft => Boolean(item) && typeof item.url === 'string' && typeof item.assetId === 'string')
        .slice(0, 6)
        .map((item) => ({ url: item.url, assetId: item.assetId }))
      : [],
  }
}
