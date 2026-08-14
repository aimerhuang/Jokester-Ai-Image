import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { getPromptImageUrl } from '@/utils/promptImages'

const RETRY_QUERY_KEY = '_coverRetry'

export function usePromptImage(source: MaybeRefOrGetter<string | null | undefined>) {
  const retryToken = ref('')
  const imageFailed = ref(false)
  const sourceUrl = computed(() => getPromptImageUrl(toValue(source)))
  const imageUrl = computed(() => {
    if (!sourceUrl.value || imageFailed.value) return ''
    if (!retryToken.value) return sourceUrl.value

    const url = new URL(sourceUrl.value, window.location.origin)
    url.searchParams.set(RETRY_QUERY_KEY, retryToken.value)
    return `${url.pathname}${url.search}`
  })

  watch(sourceUrl, reset)

  function handleImageError() {
    if (!sourceUrl.value || imageFailed.value) return
    if (!retryToken.value) {
      retryToken.value = String(Date.now())
      return
    }
    imageFailed.value = true
  }

  function reset() {
    retryToken.value = ''
    imageFailed.value = false
  }

  return { imageUrl, imageFailed, handleImageError, reset }
}
