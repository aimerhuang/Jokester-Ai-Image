const PROMPT_IMAGE_PREFIX = '/prompt-images/'

export function getPromptImageUrl(value?: string | null) {
  if (!value) return ''

  const normalized = value.trim().replace(/\\/g, '/')
  if (!normalized.startsWith(PROMPT_IMAGE_PREFIX) || normalized.includes('/../')) return ''

  try {
    const url = new URL(normalized, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith(PROMPT_IMAGE_PREFIX)) return ''
    return `${url.pathname}${url.search}`
  } catch {
    return ''
  }
}
