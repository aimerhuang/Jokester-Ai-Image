import { onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getImageRecord } from '@/services/aiImages'
import { getImageUrl } from '@/utils/imageActions'
import type { ApiError } from '@/types/api'
import type { GeneratedImageResult, ImageRecord } from '@/types/image'

const POLLING_INTERVAL_MS = 3000
const PENDING_TASK_STORAGE_KEY = 'pendingAiImageTaskId'

type ImageTaskSnapshot = GeneratedImageResult | ImageRecord

interface UseImageTaskPollingOptions {
  onUpdate: (task: ImageTaskSnapshot) => void
  onSuccess?: (task: ImageTaskSnapshot) => void
  onFailure?: (task: ImageTaskSnapshot) => void
}

export function useImageTaskPolling(options: UseImageTaskPollingOptions) {
  const polling = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  function start(taskId: string | number) {
    stop(false)
    localStorage.setItem(PENDING_TASK_STORAGE_KEY, String(taskId))
    polling.value = true

    void fetchTask(taskId)
    timer = window.setInterval(() => {
      void fetchTask(taskId)
    }, POLLING_INTERVAL_MS)
  }

  function resumePending() {
    const taskId = localStorage.getItem(PENDING_TASK_STORAGE_KEY)
    if (taskId) start(taskId)
  }

  function stop(clearPending = true) {
    if (timer) {
      window.clearInterval(timer)
      timer = null
    }
    polling.value = false
    if (clearPending) localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
  }

  async function fetchTask(taskId: string | number) {
    try {
      const task = await getImageRecord(taskId)
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

  function handleInitialResult(task: ImageTaskSnapshot) {
    options.onUpdate(task)

    const taskId = getTaskId(task)
    if (taskId && shouldPollInitialResult(task)) {
      start(taskId)
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

function shouldPollInitialResult(task: ImageTaskSnapshot) {
  return Boolean(getTaskId(task)) && !isSuccess(task) && !isFailure(task)
}
