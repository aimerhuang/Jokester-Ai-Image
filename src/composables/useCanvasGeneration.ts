import { onBeforeUnmount, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { createImageTask, getImageRecord } from '@/services/aiImages'
import { registerAiResultAsset } from '@/services/canvases'
import { normalizeTaskStatus } from '@/composables/useImageTaskPolling'
import { useAppStore } from '@/stores/app'
import { useCreditsStore } from '@/stores/credits'
import { MAX_GENERATION_RUNS, createIdempotencyKey, findNode, readTaskIds } from '@/utils/canvasDocument'
import type { ApiError } from '@/types/api'
import type { CanvasDocument, CanvasGenerateNode, CanvasGenerationRun } from '@/types/canvas'
import type { CreateImageTaskRequest, ImageRecord } from '@/types/image'

export interface CanvasGenerationResult {
  taskId: number
  resultOrdinal: number
  url: string
}

export interface CanvasNodeRuntime {
  status: 'idle' | 'submitting' | 'running' | 'succeeded' | 'failed'
  results: CanvasGenerationResult[]
  error: string
}

const POLL_INTERVAL_MS = 3000
const RUN_TIMEOUT_MS = 10 * 60 * 1000
const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled', 'partial'])

interface GenerationOptions {
  getDocument: () => CanvasDocument
  markChanged: () => void
  flush: () => Promise<void>
  requestConsent: () => Promise<boolean>
  onCatalogChanged: () => Promise<void>
}

export function useCanvasGeneration(options: GenerationOptions) {
  const app = useAppStore()
  const credits = useCreditsStore()
  const runtime = reactive(new Map<string, CanvasNodeRuntime>())
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let disposed = false

  function stateOf(nodeId: string): CanvasNodeRuntime {
    let state = runtime.get(nodeId)
    if (!state) {
      state = { status: 'idle', results: [], error: '' }
      runtime.set(nodeId, state)
    }
    return runtime.get(nodeId)!
  }

  function generateNode(nodeId: string) {
    const node = findNode(options.getDocument(), nodeId)
    return node?.type === 'generate' ? node : null
  }

  async function submit(nodeId: string, request: Omit<CreateImageTaskRequest, 'idempotencyKey'>) {
    const node = generateNode(nodeId)
    if (!node) return
    const state = stateOf(nodeId)
    if (state.status === 'submitting' || state.status === 'running') return
    state.status = 'submitting'
    state.error = ''
    // Persist the key before sending so a reload or network failure retries the same billed request.
    const key = node.data.pendingIdempotencyKey || createIdempotencyKey()
    if (node.data.pendingIdempotencyKey !== key) {
      node.data.pendingIdempotencyKey = key
      options.markChanged()
    }
    await options.flush().catch(() => undefined)
    await send(nodeId, { ...request, idempotencyKey: key }, true)
  }

  async function send(nodeId: string, request: CreateImageTaskRequest, allowConsent: boolean) {
    const state = stateOf(nodeId)
    try {
      const response = await createImageTask(request)
      const taskIds = readTaskIds(response)
      const node = generateNode(nodeId)
      if (!node) return
      const run: CanvasGenerationRun = { idempotencyKey: request.idempotencyKey, taskIds, createdAt: new Date().toISOString() }
      node.data.runs = [run, ...(node.data.runs || []).filter((item) => item.idempotencyKey !== run.idempotencyKey)]
        .slice(0, MAX_GENERATION_RUNS)
      node.data.pendingIdempotencyKey = null
      options.markChanged()
      void credits.fetchSummary().catch(() => undefined)
      if (!taskIds.length) {
        state.status = 'failed'
        state.error = app.t('canvas.generationUnknown')
        return
      }
      track(nodeId, run)
    } catch (cause) {
      const error = cause as ApiError
      const code = String(error?.code || '').trim().toUpperCase()
      if (allowConsent && code === 'AI_CONSENT_REQUIRED') {
        if (await options.requestConsent()) return send(nodeId, request, false)
        clearPendingKey(nodeId)
        state.status = 'idle'
        return
      }
      state.status = 'failed'
      state.error = describeError(error, code)
      // Only definite rejections free the key; unknown outcomes keep it so a retry cannot double charge.
      if (error?.status && error.status < 500) clearPendingKey(nodeId)
      if (code === 'IMAGE_CATALOG_CHANGED' || code === 'AUTO_SIZE_NOT_SUPPORTED') await options.onCatalogChanged()
      ElMessage.warning(state.error)
    }
  }

  function describeError(error: ApiError, code: string) {
    if (!error?.status) return app.t('canvas.generationUnknown')
    if (code === 'PROMPT_BLOCKED' || error.status === 422) return app.t('playground.promptBlocked')
    if (code === 'RATE_LIMITED' || error.status === 429) {
      return app.t('playground.rateLimitCountdown').replace('{seconds}', String(Math.max(1, error.retryAfterSeconds || 1)))
    }
    if (code === 'IDEMPOTENCY_CONFLICT' || error.status === 409) return app.t('playground.idempotencyConflict')
    if (code === 'IMAGE_CATALOG_CHANGED') return app.t('playground.catalogChanged')
    if (code === 'AUTO_SIZE_NOT_SUPPORTED') return app.t('playground.autoSizeNotSupported')
    if (error.status === 403) return app.t('playground.generationForbidden')
    if (error.status >= 500) return app.t('playground.serviceUnavailable')
    return error.message || app.t('playground.generationFailed')
  }

  function clearPendingKey(nodeId: string) {
    const node = generateNode(nodeId)
    if (node?.data.pendingIdempotencyKey) {
      node.data.pendingIdempotencyKey = null
      options.markChanged()
    }
  }

  function track(nodeId: string, run: CanvasGenerationRun) {
    stopTracking(nodeId)
    const state = stateOf(nodeId)
    state.status = 'running'
    state.error = ''
    void poll(nodeId, run)
  }

  async function poll(nodeId: string, run: CanvasGenerationRun) {
    if (disposed) return
    let tasks: Array<ImageRecord | null>
    try {
      tasks = await Promise.all(run.taskIds.map((id) => getImageRecord(id).catch((error: ApiError) => {
        if (error?.status === 404) return null
        throw error
      })))
    } catch {
      scheduleNext(nodeId, run)
      return
    }
    if (disposed) return
    const state = stateOf(nodeId)
    const statuses = tasks.map((task) => task ? normalizeTaskStatus(task) : 'failed')
    state.results = collectResults(run, tasks)
    if (!statuses.every((status) => TERMINAL_STATES.has(status))) {
      if (Date.now() - Date.parse(run.createdAt) > RUN_TIMEOUT_MS) {
        state.status = 'failed'
        state.error = app.t('canvas.generationTimeout')
        return
      }
      scheduleNext(nodeId, run)
      return
    }
    void credits.fetchSummary().catch(() => undefined)
    if (state.results.length) {
      state.status = 'succeeded'
      const node = generateNode(nodeId)
      const primary = node?.data.primaryResult
      if (node && (!primary || !run.taskIds.includes(primary.taskId) || !primary.assetId)) {
        await selectPrimary(nodeId, state.results[0])
      }
    } else {
      state.status = 'failed'
      state.error = tasks.find((task) => task?.errorMessage)?.errorMessage || app.t('canvas.generationFailed')
    }
  }

  function scheduleNext(nodeId: string, run: CanvasGenerationRun) {
    if (disposed) return
    timers.set(nodeId, setTimeout(() => void poll(nodeId, run), POLL_INTERVAL_MS))
  }

  function stopTracking(nodeId: string) {
    const timer = timers.get(nodeId)
    if (timer) clearTimeout(timer)
    timers.delete(nodeId)
  }

  function collectResults(run: CanvasGenerationRun, tasks: Array<ImageRecord | null>) {
    return tasks.flatMap((task, index) => {
      if (!task || normalizeTaskStatus(task) !== 'succeeded') return []
      return readResultUrls(task.resultUrls).map((url, resultOrdinal) => ({ taskId: run.taskIds[index], resultOrdinal, url }))
    })
  }

  // The selected result becomes the node output; it must be an asset so downstream nodes can reference it.
  async function selectPrimary(nodeId: string, result: CanvasGenerationResult) {
    try {
      const asset = await registerAiResultAsset(result.taskId, result.resultOrdinal)
      const node = generateNode(nodeId)
      if (!node) return
      node.data.primaryResult = { taskId: result.taskId, resultOrdinal: result.resultOrdinal, assetId: asset.assetId }
      options.markChanged()
      return asset
    } catch {
      ElMessage.warning(app.t('canvas.registerFailed'))
      return null
    }
  }

  // Restores status and alternatives for every generate node after the canvas loads.
  function resumeAll() {
    options.getDocument().nodes.forEach((node) => {
      if (node.type !== 'generate') return
      const run = (node as CanvasGenerateNode).data.runs?.[0]
      if (run?.taskIds.length) track(node.id, run)
    })
  }

  function forget(nodeIds: Iterable<string>) {
    for (const id of nodeIds) {
      stopTracking(id)
      runtime.delete(id)
    }
  }

  onBeforeUnmount(() => {
    disposed = true
    timers.forEach((timer) => clearTimeout(timer))
    timers.clear()
  })

  return { runtime, stateOf, submit, selectPrimary, resumeAll, forget }
}

function readResultUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item))
  if (typeof value === 'string' && value.trim()) {
    try {
      return readResultUrls(JSON.parse(value))
    } catch {
      return [value.trim()]
    }
  }
  return []
}
