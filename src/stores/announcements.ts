import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getAnnouncements, getQqGroup, type AnnouncementItem, type QqGroupConfig } from '@/services/announcements'
import { getLastSeen, getQqPromptRecord, hasUnread, setLastSeen, setQqPromptRecord, shouldShowQqPrompt,
  type QqAction, type QqPromptRecord } from '@/utils/noticeStorage'

export const useAnnouncementsStore = defineStore('announcements', () => {
  const ownerUserId = ref<number | null>(null)
  const items = ref<AnnouncementItem[]>([])
  const total = ref(0)
  const pageIndex = ref(0)
  const hasMore = ref(false)
  const latestPublishedAt = ref<string | null>(null)
  const lastSeenAt = ref<string | null>(null)
  const qqGroup = ref<QqGroupConfig | null>(null)
  const qqPromptRecord = ref<QqPromptRecord | null>(null)
  const loading = ref(false)
  const loadError = ref(false)
  const lastFetchedAt = ref(0)
  let generation = 0
  let refreshRequest: Promise<void> | null = null
  let promptShown = false

  const unread = computed(() => hasUnread(latestPublishedAt.value, lastSeenAt.value))

  function activateForUser(userId: number | null) {
    if (userId === ownerUserId.value) return
    generation++
    refreshRequest = null
    promptShown = false
    ownerUserId.value = userId
    items.value = []
    total.value = pageIndex.value = lastFetchedAt.value = 0
    hasMore.value = loading.value = loadError.value = false
    latestPublishedAt.value = qqGroup.value = null
    lastSeenAt.value = userId ? getLastSeen(userId) : null
    qqPromptRecord.value = userId ? getQqPromptRecord(userId) : null
  }

  async function loadPage(index: number, current: number) {
    loading.value = true
    loadError.value = false
    try {
      const feed = await getAnnouncements(index)
      if (current !== generation) return
      if (!Array.isArray(feed?.items)) throw new Error('Invalid announcement feed')
      if (index === 1) {
        latestPublishedAt.value = feed.latestPublishedAt ?? null
        // A background refresh keeps the later pages when the first page is unchanged, so an open list does not jump back.
        if (pageIndex.value > 1 && feed.total === total.value
          && JSON.stringify(feed.items) === JSON.stringify(items.value.slice(0, feed.items.length))) return
      }
      const existing = new Set(items.value.map(item => item.id))
      items.value = index === 1 ? feed.items : [...items.value, ...feed.items.filter(item => !existing.has(item.id))]
      total.value = feed.total
      pageIndex.value = feed.pageIndex
      hasMore.value = feed.hasMore ?? index * feed.pageSize < feed.total
    } catch {
      if (current !== generation) return
      loadError.value = true
      if (index === 1) {
        items.value = []
        latestPublishedAt.value = null
        hasMore.value = false
        pageIndex.value = total.value = 0
      }
    } finally {
      if (current === generation) loading.value = false
    }
  }

  function refresh() {
    if (!ownerUserId.value) return Promise.resolve()
    if (refreshRequest) return refreshRequest
    const current = ++generation
    const community = getQqGroup().then(config => {
      if (current === generation) qqGroup.value = config
    }).catch(() => {
      if (current === generation) qqGroup.value = null
    })
    const request = Promise.all([loadPage(1, current), community]).then(() => {
      if (current === generation) lastFetchedAt.value = Date.now()
    }).finally(() => {
      if (request === refreshRequest) refreshRequest = null
    })
    refreshRequest = request
    return request
  }

  function refreshIfStale(maxAgeMs = 300_000) {
    return Date.now() - lastFetchedAt.value >= maxAgeMs ? refresh() : Promise.resolve()
  }

  async function loadMore() {
    if (!ownerUserId.value || loading.value || !hasMore.value) return
    await loadPage(pageIndex.value + 1, generation)
  }

  function markSeen() {
    const previous = lastSeenAt.value
    const latest = latestPublishedAt.value
    if (ownerUserId.value && latest && hasUnread(latest, previous)) {
      lastSeenAt.value = latest
      setLastSeen(ownerUserId.value, latest)
    }
    return previous
  }

  function takeQqPrompt() {
    if (promptShown || !shouldShowQqPrompt(qqGroup.value, qqPromptRecord.value, Date.now())) return null
    promptShown = true
    return qqGroup.value
  }

  function recordQqAction(action: QqAction, promptVersion: number) {
    if (!ownerUserId.value) return
    const record = { promptVersion, action, at: Date.now() }
    qqPromptRecord.value = record
    setQqPromptRecord(ownerUserId.value, record)
  }

  return { ownerUserId, items, total, pageIndex, hasMore, latestPublishedAt, lastSeenAt, qqGroup,
    loading, loadError, lastFetchedAt, unread, activateForUser, refresh, refreshIfStale,
    loadMore, markSeen, takeQqPrompt, recordQqAction }
})
