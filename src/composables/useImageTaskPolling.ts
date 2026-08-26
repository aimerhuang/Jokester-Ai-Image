import { onBeforeUnmount, ref } from 'vue'
import { getImageRecord } from '@/services/aiImages'
import { getImageUrl } from '@/utils/imageActions'
import type { ApiError } from '@/types/api'
import type { GeneratedImageResult, ImageRecord, ImageTaskCreationResult } from '@/types/image'

const POLLING_INTERVAL_MS = 3000
const MIN_POLLING_INTERVAL_MS = 1000
const MAX_POLLING_INTERVAL_MS = 30000
const MAX_TIMER_DELAY_MS = 2_147_000_000
const PENDING_TASK_STORAGE_KEY = 'pendingAiImageTaskId'
const PENDING_TASK_STORAGE_VERSION = 2

export type ImageTaskSnapshot = GeneratedImageResult | ImageRecord | ImageTaskCreationResult

interface UseImageTaskPollingOptions {
  onUpdate: (task: ImageTaskSnapshot, index: number, total: number) => void
  onSuccess?: (task: ImageTaskSnapshot, index: number, total: number) => void
  onFailure?: (task: ImageTaskSnapshot, index: number, total: number) => void
  onExpired?: (taskId: string | number, index: number, total: number) => void
  onUnavailable?: (taskId: string | number, index: number, total: number) => void
  onError?: (error: ApiError, taskId: string | number) => void
}

interface StartPollingOptions {
  expiresAt?: number
  imageCount?: number
}

interface PendingTaskPayload extends StartPollingOptions {
  version: number
  taskId: string | number
  taskIds: Array<string | number>
}

interface ActiveTask {
  taskId: string | number
  index: number
  total: number
  expiresAt?: number
  imageCount?: number
  timer: ReturnType<typeof setTimeout> | null
  expirationTimer: ReturnType<typeof setTimeout> | null
}

export function useImageTaskPolling(options: UseImageTaskPollingOptions) {
  const polling = ref(false)
  const activeTasks = new Map<string, ActiveTask>()
  let batchTaskIds: Array<string | number> = []
  let batchOptions: StartPollingOptions = {}

  function start(taskId: string | number, startOptions: StartPollingOptions = {}) {
    startMany([taskId], startOptions)
  }

  function startMany(taskIds: Array<string | number>, startOptions: StartPollingOptions = {}) {
    stop(false)
    const uniqueTaskIds = uniqueIds(taskIds)
    if (!uniqueTaskIds.length) return
    batchTaskIds = uniqueTaskIds
    batchOptions = { ...startOptions }

    if (isExpired(startOptions.expiresAt)) {
      localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
      uniqueTaskIds.forEach((taskId, index) => options.onExpired?.(taskId, index, uniqueTaskIds.length))
      return
    }

    storePendingTasks(uniqueTaskIds, startOptions)
    uniqueTaskIds.forEach((taskId, index) => {
      const activeTask: ActiveTask = {
        taskId,
        index,
        total: uniqueTaskIds.length,
        expiresAt: startOptions.expiresAt,
        imageCount: startOptions.imageCount,
        timer: null,
        expirationTimer: null,
      }
      activeTasks.set(String(taskId), activeTask)
      scheduleExpiration(activeTask)
    })
    syncPollingState()
    activeTasks.forEach((activeTask) => void fetchTask(activeTask))
  }

  function resumePending() {
    const pendingTask = readPendingTask()
    if (!pendingTask) return null

    if (isExpired(pendingTask.expiresAt)) {
      localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
      pendingTask.taskIds.forEach((taskId, index) => options.onExpired?.(taskId, index, pendingTask.taskIds.length))
      return pendingTask
    }

    startMany(pendingTask.taskIds, pendingTask)
    return pendingTask
  }

  function stop(clearPending = true) {
    activeTasks.forEach(clearTaskTimers)
    activeTasks.clear()
    syncPollingState()
    if (clearPending) {
      batchTaskIds = []
      batchOptions = {}
      localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
    }
  }

  function scheduleExpiration(activeTask: ActiveTask) {
    if (typeof activeTask.expiresAt !== 'number') return
    if (activeTask.expirationTimer) window.clearTimeout(activeTask.expirationTimer)

    const remainingMs = activeTask.expiresAt - Date.now()
    if (remainingMs <= 0) {
      expireTask(activeTask)
      return
    }

    activeTask.expirationTimer = window.setTimeout(
      () => expireTask(activeTask),
      Math.min(remainingMs, MAX_TIMER_DELAY_MS),
    )
  }

  function expireTask(activeTask: ActiveTask) {
    if (!activeTasks.has(String(activeTask.taskId))) return
    finishTask(activeTask)
    options.onExpired?.(activeTask.taskId, activeTask.index, activeTask.total)
  }

  async function fetchTask(activeTask: ActiveTask) {
    if (!activeTasks.has(String(activeTask.taskId))) return

    try {
      const task = await getImageRecord(activeTask.taskId)
      if (!activeTasks.has(String(activeTask.taskId))) return
      if (!task) {
        finishTask(activeTask)
        options.onUnavailable?.(activeTask.taskId, activeTask.index, activeTask.total)
        return
      }
      options.onUpdate(task, activeTask.index, activeTask.total)

      if (isProcessing(task)) {
        const serverExpiresAt = parseExpiresAt(task.expiresAt)
        if (serverExpiresAt) {
          activeTask.expiresAt = serverExpiresAt
          scheduleExpiration(activeTask)
          persistActiveTasks()
        }
        scheduleNext(activeTask, task.pollAfterSeconds, normalizeTaskStatus(task) === 'processing' ? 5000 : 3000)
        return
      }

      finishTask(activeTask)
      if (isSuccess(task)) {
        options.onSuccess?.(task, activeTask.index, activeTask.total)
        return
      }

      options.onFailure?.(task, activeTask.index, activeTask.total)
    } catch (error) {
      const apiError = error as ApiError
      if (activeTasks.has(String(activeTask.taskId))) scheduleNext(activeTask, apiError.retryAfterSeconds)
      options.onError?.(apiError, activeTask.taskId)
    }
  }

  function scheduleNext(activeTask: ActiveTask, pollAfterSeconds?: number, fallbackDelayMs = POLLING_INTERVAL_MS) {
    if (!activeTasks.has(String(activeTask.taskId))) return
    if (activeTask.timer) window.clearTimeout(activeTask.timer)
    const requestedMs = Number(pollAfterSeconds) * 1000
    const delay = Number.isFinite(requestedMs) && requestedMs > 0
      ? Math.min(MAX_POLLING_INTERVAL_MS, Math.max(MIN_POLLING_INTERVAL_MS, requestedMs))
      : fallbackDelayMs
    activeTask.timer = window.setTimeout(() => {
      activeTask.timer = null
      void fetchTask(activeTask)
    }, delay)
  }

  function finishTask(activeTask: ActiveTask) {
    clearTaskTimers(activeTask)
    activeTasks.delete(String(activeTask.taskId))
    syncPollingState()
    persistActiveTasks()
  }

  function syncPollingState() {
    polling.value = activeTasks.size > 0
  }

  function persistActiveTasks() {
    const remaining = [...activeTasks.values()].sort((left, right) => left.index - right.index)
    if (!remaining.length) {
      batchTaskIds = []
      batchOptions = {}
      localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
      return
    }
    const activeExpirations = remaining.map((item) => item.expiresAt).filter((value): value is number => typeof value === 'number')
    batchOptions = {
      expiresAt: activeExpirations.length ? Math.max(...activeExpirations) : batchOptions.expiresAt,
      imageCount: batchOptions.imageCount || remaining[0]?.imageCount,
    }
    storePendingTasks(batchTaskIds.length ? batchTaskIds : remaining.map((item) => item.taskId), {
      expiresAt: batchOptions.expiresAt,
      imageCount: batchOptions.imageCount,
    })
  }

  function handleInitialResult(task: ImageTaskSnapshot, startOptions: StartPollingOptions = {}) {
    const taskIds = getTaskIds(task)
    const total = Math.max(taskIds.length, 1)
    options.onUpdate(task, 0, total)

    if (taskIds.length && shouldPollInitialResult(task)) {
      startMany(taskIds, {
        ...startOptions,
        expiresAt: parseExpiresAt(task.expiresAt) || startOptions.expiresAt,
      })
      return
    }

    if (isSuccess(task)) {
      stop()
      options.onSuccess?.(task, 0, total)
      return
    }

    if (isFailure(task)) {
      stop()
      options.onFailure?.(task, 0, total)
    }
  }

  onBeforeUnmount(() => stop(false))

  return {
    polling,
    start,
    startMany,
    stop,
    resumePending,
    handleInitialResult,
  }
}

function clearTaskTimers(activeTask: ActiveTask) {
  if (activeTask.timer) window.clearTimeout(activeTask.timer)
  if (activeTask.expirationTimer) window.clearTimeout(activeTask.expirationTimer)
  activeTask.timer = null
  activeTask.expirationTimer = null
}

function storePendingTasks(taskIds: Array<string | number>, options: StartPollingOptions) {
  const payload: PendingTaskPayload = {
    version: PENDING_TASK_STORAGE_VERSION,
    taskId: taskIds[0]!,
    taskIds,
    expiresAt: options.expiresAt,
    imageCount: options.imageCount,
  }
  localStorage.setItem(PENDING_TASK_STORAGE_KEY, JSON.stringify(payload))
}

function readPendingTask(): PendingTaskPayload | null {
  const raw = localStorage.getItem(PENDING_TASK_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PendingTaskPayload>
    const taskIds = uniqueIds(Array.isArray(parsed.taskIds) ? parsed.taskIds : parsed.taskId ? [parsed.taskId] : [])
    if (!parsed || typeof parsed !== 'object' || !taskIds.length || typeof parsed.expiresAt !== 'number') {
      localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
      return null
    }

    return {
      version: Number(parsed.version) || 1,
      taskId: taskIds[0]!,
      taskIds,
      expiresAt: parsed.expiresAt,
      imageCount: parsed.imageCount,
    }
  } catch {
    localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
    return null
  }
}

function uniqueIds(taskIds: Array<string | number>) {
  const seen = new Set<string>()
  return taskIds.filter((taskId) => {
    if (taskId === '' || taskId === null || taskId === undefined) return false
    const key = String(taskId)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getTaskIds(task: ImageTaskSnapshot) {
  const taskWithIds = task as ImageTaskCreationResult
  const arrayIds = Array.isArray(taskWithIds.taskIds) && taskWithIds.taskIds.length
    ? taskWithIds.taskIds
    : Array.isArray(taskWithIds.ids)
      ? taskWithIds.ids
      : []
  const scalarIds = [task.taskId || task.id].filter(Boolean) as Array<string | number>
  return uniqueIds(arrayIds.length ? arrayIds : scalarIds)
}

export function getTaskId(task: ImageTaskSnapshot) {
  return getTaskIds(task)[0]
}

export function isProcessing(task: ImageTaskSnapshot) {
  const status = normalizeTaskStatus(task)
  return status === 'queued' || status === 'processing'
}

export function isSuccess(task: ImageTaskSnapshot) {
  return normalizeTaskStatus(task) === 'succeeded'
    || (task.status === undefined && task.statusCode === undefined && task.batchStatus === undefined && Boolean(getImageUrl(task)))
}

export function isFailure(task: ImageTaskSnapshot) {
  const status = normalizeTaskStatus(task)
  return status === 'failed' || status === 'cancelled' || status === 'partial'
}

export function normalizeTaskStatus(task: ImageTaskSnapshot) {
  const rawStatus = task.status ?? task.statusCode ?? task.batchStatus
  if (typeof rawStatus === 'string') return rawStatus.trim().toLowerCase()
  if (rawStatus === 0 || rawStatus === 3) return 'processing'
  if (rawStatus === 1) return 'succeeded'
  if (rawStatus === 2) return 'failed'
  return ''
}

function parseExpiresAt(expiresAt: string | undefined) {
  if (!expiresAt) return undefined
  const value = Date.parse(expiresAt)
  return Number.isNaN(value) ? undefined : value
}

function isExpired(expiresAt: number | undefined) {
  return typeof expiresAt === 'number' && expiresAt <= Date.now()
}

function shouldPollInitialResult(task: ImageTaskSnapshot) {
  return getTaskIds(task).length > 0 && !isSuccess(task) && !isFailure(task)
}
