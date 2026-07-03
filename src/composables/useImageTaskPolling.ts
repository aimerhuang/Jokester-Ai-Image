import { onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getImageRecord } from '@/services/aiImages'
import { getImageUrl } from '@/utils/imageActions'
import type { ApiError } from '@/types/api'
import type { GeneratedImageResult, ImageRecord } from '@/types/image'

const POLLING_INTERVAL_MS = 3000
const PENDING_TASK_STORAGE_KEY = 'pendingAiImageTaskId'
const PENDING_TASK_STORAGE_VERSION = 1

type ImageTaskSnapshot = GeneratedImageResult | ImageRecord

interface UseImageTaskPollingOptions {
  onUpdate: (task: ImageTaskSnapshot) => void
  onSuccess?: (task: ImageTaskSnapshot) => void
  onFailure?: (task: ImageTaskSnapshot) => void
  onExpired?: (taskId: string | number) => void
}

interface StartPollingOptions {
  expiresAt?: number
  imageCount?: number
}

interface PendingTaskPayload extends StartPollingOptions {
  version: number
  taskId: string | number
}

export function useImageTaskPolling(options: UseImageTaskPollingOptions) {
  const polling = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let expirationTimer: ReturnType<typeof setTimeout> | null = null
  let activeTaskId: string | null = null

  function start(taskId: string | number, startOptions: StartPollingOptions = {}) {
    stop(false)

    if (isExpired(startOptions.expiresAt)) {
      expireTask(taskId)
      return
    }

    storePendingTask(taskId, startOptions)
    activeTaskId = String(taskId)
    polling.value = true
    scheduleExpiration(taskId, startOptions.expiresAt)

    void fetchTask(taskId)
    timer = window.setInterval(() => {
      void fetchTask(taskId)
    }, POLLING_INTERVAL_MS)
  }

  function resumePending() {
    const pendingTask = readPendingTask()
    if (!pendingTask) return

    if (isExpired(pendingTask.expiresAt)) {
      localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
      return
    }

    start(pendingTask.taskId, pendingTask)
  }

  function stop(clearPending = true) {
    if (timer) {
      window.clearInterval(timer)
      timer = null
    }
    if (expirationTimer) {
      window.clearTimeout(expirationTimer)
      expirationTimer = null
    }
    polling.value = false
    if (clearPending) {
      activeTaskId = null
      localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
    }
  }

  function scheduleExpiration(taskId: string | number, expiresAt: number | undefined) {
    if (typeof expiresAt !== 'number') return

    const remainingMs = expiresAt - Date.now()
    if (remainingMs <= 0) {
      expireTask(taskId)
      return
    }

    expirationTimer = window.setTimeout(() => expireTask(taskId), remainingMs)
  }

  function expireTask(taskId: string | number) {
    stop()
    options.onExpired?.(taskId)
  }

  async function fetchTask(taskId: string | number) {
    if (activeTaskId !== String(taskId)) return

    try {
      const task = await getImageRecord(taskId)
      if (activeTaskId !== String(taskId)) return
      options.onUpdate(task)

      if (isProcessing(task)) return

      stop()
      if (isSuccess(task)) {
        options.onSuccess?.(task)
        return
      }

      options.onFailure?.(task)
      ElMessage.error(task.errorMessage || 'Image generation failed')
    } catch (error) {
      ElMessage.error((error as ApiError).message)
    }
  }

  function handleInitialResult(task: ImageTaskSnapshot, startOptions: StartPollingOptions = {}) {
    options.onUpdate(task)

    const taskId = getTaskId(task)
    if (taskId && shouldPollInitialResult(task)) {
      start(taskId, startOptions)
      return
    }

    if (isSuccess(task)) {
      stop()
      options.onSuccess?.(task)
      return
    }

    if (isFailure(task)) {
      stop()
      options.onFailure?.(task)
      ElMessage.error(task.errorMessage || 'Image generation failed')
    }
  }

  onBeforeUnmount(() => stop(false))

  return {
    polling,
    start,
    stop,
    resumePending,
    handleInitialResult,
  }
}

function storePendingTask(taskId: string | number, options: StartPollingOptions) {
  const payload: PendingTaskPayload = {
    version: PENDING_TASK_STORAGE_VERSION,
    taskId,
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
    if (!parsed || typeof parsed !== 'object' || !parsed.taskId || typeof parsed.expiresAt !== 'number') {
      localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
      return null
    }

    return {
      version: Number(parsed.version) || PENDING_TASK_STORAGE_VERSION,
      taskId: parsed.taskId,
      expiresAt: parsed.expiresAt,
      imageCount: parsed.imageCount,
    }
  } catch {
    localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
    return null
  }
}

export function getTaskId(task: ImageTaskSnapshot) {
  return task.taskId || task.id
}

export function isProcessing(task: ImageTaskSnapshot) {
  return Number(task.status) === 0
}

export function isSuccess(task: ImageTaskSnapshot) {
  return Number(task.status) === 1 || Boolean(getImageUrl(task))
}

export function isFailure(task: ImageTaskSnapshot) {
  return Number(task.status) === 2
}

function isExpired(expiresAt: number | undefined) {
  return typeof expiresAt === 'number' && expiresAt <= Date.now()
}

function shouldPollInitialResult(task: ImageTaskSnapshot) {
  return Boolean(getTaskId(task)) && !isSuccess(task) && !isFailure(task)
}
