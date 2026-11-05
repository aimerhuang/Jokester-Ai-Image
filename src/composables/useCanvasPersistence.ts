import { onBeforeUnmount, ref } from 'vue'
import { getCanvas, saveCanvasDocument } from '@/services/canvases'
import { normalizeCanvasDocument } from '@/utils/canvasDocument'
import type { ApiError } from '@/types/api'
import type { CanvasDetail, CanvasDocument } from '@/types/canvas'

export type CanvasSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
export type CanvasConflictChoice = 'reload' | 'overwrite'

const AUTOSAVE_DELAY_MS = 1500
const RETRY_DELAY_MS = 10_000
const DRAFT_PREFIX = 'jokester:canvas-draft'

interface LocalDraft {
  baseRevision: number
  document: CanvasDocument
  savedAt: number
}

interface PersistenceOptions {
  canvasId: string
  userId: number | string | null
  getDocument: () => CanvasDocument
  applyDocument: (document: CanvasDocument) => void
  onLoaded: (detail: CanvasDetail) => void
  onSaved?: (result: { coverUrl?: string | null; storageBytes: number }) => void
  resolveConflict: () => Promise<CanvasConflictChoice>
  confirmRestoreDraft: () => Promise<boolean>
  onSaveError?: (error: ApiError) => void
}

// Autosave with optimistic concurrency: every save sends the revision it was based on and
// unsynced edits are mirrored to localStorage so a failed save never loses work.
export function useCanvasPersistence(options: PersistenceOptions) {
  const status = ref<CanvasSaveStatus>('idle')
  const revision = ref(0)
  const dirty = ref(false)
  let changeVersion = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let draftTimer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<void> | null = null
  let disposed = false
  const draftKey = `${DRAFT_PREFIX}:${options.userId ?? 'anonymous'}:${options.canvasId}`

  async function load() {
    const detail = await getCanvas(options.canvasId)
    const document = normalizeCanvasDocument(detail.document)
    revision.value = detail.revision
    options.applyDocument(document)
    options.onLoaded(detail)
    dirty.value = false
    status.value = 'saved'

    const draft = readDraft()
    if (draft && JSON.stringify(draft.document) !== JSON.stringify(document)) {
      if (await options.confirmRestoreDraft()) {
        options.applyDocument(normalizeCanvasDocument(draft.document))
        markChanged()
      } else {
        clearDraft()
      }
    }
  }

  function markChanged() {
    changeVersion += 1
    dirty.value = true
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(writeDraft, 400)
    schedule(AUTOSAVE_DELAY_MS)
  }

  function schedule(delay: number) {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void save(), delay)
  }

  async function flush() {
    if (timer) clearTimeout(timer)
    timer = null
    if (inflight) await inflight
    if (dirty.value) await save()
  }

  function save(): Promise<void> {
    if (inflight) return inflight
    if (!dirty.value || status.value === 'conflict') return Promise.resolve()
    inflight = performSave().finally(() => {
      inflight = null
    })
    return inflight
  }

  async function performSave() {
    const sentVersion = changeVersion
    const document = JSON.parse(JSON.stringify(options.getDocument())) as CanvasDocument
    status.value = 'saving'
    try {
      const result = await saveCanvasDocument(options.canvasId, revision.value, document)
      revision.value = result.revision
      options.onSaved?.(result)
      if (changeVersion === sentVersion) {
        dirty.value = false
        clearDraft()
        status.value = 'saved'
      } else {
        writeDraft()
        schedule(AUTOSAVE_DELAY_MS)
      }
    } catch (cause) {
      const error = cause as ApiError
      const code = String(error?.code || '').toUpperCase()
      if (code === 'CANVAS_REVISION_CONFLICT') {
        status.value = 'conflict'
        await handleConflict(error)
        return
      }
      status.value = 'error'
      options.onSaveError?.(error)
      if (error?.status === 429 || code === 'RATE_LIMITED') {
        schedule(Math.max(1, error.retryAfterSeconds || 5) * 1000)
      } else if (!error?.status || error.status >= 500) {
        schedule(RETRY_DELAY_MS)
      }
    }
  }

  async function handleConflict(error: ApiError) {
    const details = error.details as { currentRevision?: number } | undefined
    const choice = await options.resolveConflict()
    if (choice === 'reload') {
      clearDraft()
      dirty.value = false
      await load()
      return
    }
    const currentRevision = Number(details?.currentRevision)
    if (Number.isFinite(currentRevision) && currentRevision > 0) {
      revision.value = currentRevision
    } else {
      revision.value = (await getCanvas(options.canvasId)).revision
    }
    status.value = 'idle'
    // Already running inside the in-flight save; call the worker directly to avoid awaiting ourselves.
    await performSave()
  }

  function readDraft(): LocalDraft | null {
    try {
      const value = JSON.parse(localStorage.getItem(draftKey) || 'null') as LocalDraft | null
      return value?.document ? value : null
    } catch {
      return null
    }
  }

  function writeDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        baseRevision: revision.value,
        document: options.getDocument(),
        savedAt: Date.now(),
      } satisfies LocalDraft))
    } catch {
      // Storage quota errors only disable the offline draft; server saves still run.
    }
  }

  function clearDraft() {
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = null
    localStorage.removeItem(draftKey)
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value) return
    void save()
    event.preventDefault()
  }

  window.addEventListener('beforeunload', handleBeforeUnload)
  onBeforeUnmount(() => {
    disposed = true
    if (timer) clearTimeout(timer)
    if (draftTimer) {
      clearTimeout(draftTimer)
      if (dirty.value) writeDraft()
    }
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })

  return { status, revision, dirty, load, markChanged, flush, retry: save }
}
