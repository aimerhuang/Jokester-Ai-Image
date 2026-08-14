import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { resolveMediaUrl } from '@/utils/authenticatedMedia'

export function useAuthenticatedImageUrls(source: MaybeRefOrGetter<readonly string[]>) {
  const urls = ref<string[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  let objectUrls: string[] = []
  let requestId = 0

  const revokeObjectUrls = () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url))
    objectUrls = []
  }

  watch(
    () => [...toValue(source)],
    async (sourceUrls, _previous, onCleanup) => {
      const currentRequestId = ++requestId
      const controller = new AbortController()
      const pendingObjectUrls: string[] = []
      onCleanup(() => controller.abort())

      loading.value = sourceUrls.length > 0
      error.value = null
      if (sourceUrls.length === 0) {
        revokeObjectUrls()
        urls.value = []
        loading.value = false
        return
      }

      try {
        const resolved = await Promise.all(sourceUrls.map(async (url) => {
          const media = await resolveMediaUrl(url, controller.signal)
          if (media.objectUrl) pendingObjectUrls.push(media.objectUrl)
          return media.url
        }))
        if (currentRequestId !== requestId) {
          pendingObjectUrls.forEach((url) => URL.revokeObjectURL(url))
          return
        }

        revokeObjectUrls()
        objectUrls = pendingObjectUrls
        urls.value = resolved
      } catch (cause) {
        pendingObjectUrls.forEach((url) => URL.revokeObjectURL(url))
        if (currentRequestId === requestId && !controller.signal.aborted) {
          revokeObjectUrls()
          urls.value = []
          error.value = cause
        }
      } finally {
        if (currentRequestId === requestId) loading.value = false
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    requestId++
    revokeObjectUrls()
  })

  return { urls, loading, error }
}

export function useAuthenticatedImageUrl(source: MaybeRefOrGetter<string>) {
  const result = useAuthenticatedImageUrls(() => {
    const url = toValue(source)
    return url ? [url] : []
  })
  return {
    url: computed(() => result.urls.value[0] || ''),
    loading: result.loading,
    error: result.error,
  }
}
