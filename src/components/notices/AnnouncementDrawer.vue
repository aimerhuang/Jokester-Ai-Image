<template>
  <el-drawer v-model="open" direction="rtl" size="min(420px, 100vw)" :title="app.t('notices.title')" append-to-body class="announcement-drawer">
    <template #header="{ titleId, titleClass }">
      <div class="drawer-heading"><el-icon><Bell /></el-icon><div><h2 :id="titleId" :class="titleClass">{{ app.t('notices.title') }}</h2><p>{{ app.t('notices.subtitle') }}</p></div></div>
    </template>
    <section v-if="selectedId !== null" class="scroll-area" :aria-busy="detailLoading">
      <el-button :icon="ArrowLeft" text @click="back">{{ app.t('notices.back') }}</el-button>
      <template v-if="detail">
        <AnnouncementCard :item="detail" expanded />
        <p v-if="detail.content" class="body-text">{{ detail.content }}</p>
        <el-button v-if="detail.linkUrl && detail.linkText" type="primary" @click="followLink(detail.linkUrl)">{{ detail.linkText }}</el-button>
      </template>
      <div v-else class="feedback" role="status">{{ app.t(detailLoading ? 'notices.loading' : 'notices.loadFailed') }}
        <el-button v-if="!detailLoading" @click="showDetail(selectedId)">{{ app.t('notices.retry') }}</el-button>
      </div>
    </section>
    <section v-else class="scroll-area" :aria-busy="store.loading" @scroll.passive="onScroll">
      <AnnouncementCard v-for="item in store.items" :key="item.id" :item="item" :is-new="hasUnread(item.publishedAt, seenBeforeOpen)" @select="showDetail(item.id)" />
      <div v-if="store.loadError" class="feedback" role="status">{{ app.t('notices.loadFailed') }}<el-button @click="retryList">{{ app.t('notices.retry') }}</el-button></div>
      <div v-else-if="store.loading" class="feedback" role="status">{{ app.t('notices.loading') }}</div>
      <div v-else-if="!store.items.length" class="feedback">{{ app.t('notices.empty') }}</div>
      <el-button v-else-if="store.hasMore" @click="store.loadMore">{{ app.t('notices.loadMore') }}</el-button>
    </section>
    <template v-if="store.qqGroup?.enabled && store.qqGroup.groupNumber" #footer>
      <div class="group-footer"><span>{{ app.t('notices.officialGroup') }} <b>{{ store.qqGroup.groupNumber }}</b></span>
        <el-button text @click="copyGroupNumber(store.qqGroup.groupNumber!)">{{ app.t('notices.copy') }}</el-button>
        <a v-if="store.qqGroup.joinUrl" :href="store.qqGroup.joinUrl" target="_blank" rel="noopener noreferrer">{{ app.t('notices.join') }}</a>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, Bell } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { getAnnouncement, type AnnouncementDetail } from '@/services/announcements'
import { useAppStore } from '@/stores/app'
import { useAnnouncementsStore } from '@/stores/announcements'
import { copyGroupNumber, hasUnread } from '@/utils/noticeStorage'
import type { ApiError } from '@/types/api'
import AnnouncementCard from './AnnouncementCard.vue'

const open = defineModel<boolean>({ required: true })
const app = useAppStore()
const store = useAnnouncementsStore()
const router = useRouter()
const seenBeforeOpen = ref<string | null>(null)
const selectedId = ref<number | null>(null)
const detail = ref<AnnouncementDetail | null>(null)
const detailLoading = ref(false)
let request: AbortController | undefined

watch(open, visible => {
  back()
  if (visible) {
    seenBeforeOpen.value = store.markSeen()
    void store.refreshIfStale(60_000)
  }
})
watch(() => store.latestPublishedAt, () => { if (open.value) store.markSeen() })
onBeforeUnmount(() => request?.abort())

async function showDetail(id: number) {
  request?.abort()
  const current = request = new AbortController()
  selectedId.value = id
  detail.value = null
  detailLoading.value = true
  try {
    const result = await getAnnouncement(id, current.signal)
    if (!current.signal.aborted) detail.value = result
  } catch (error) {
    if (!current.signal.aborted && (error as ApiError).status === 404) {
      back()
      ElMessage.info(app.t('notices.offline'))
      void store.refresh()
    }
  } finally {
    if (!current.signal.aborted) detailLoading.value = false
  }
}
function back() {
  request?.abort()
  selectedId.value = detail.value = null
  detailLoading.value = false
}
function retryList() {
  if (store.pageIndex > 0 && store.hasMore) void store.loadMore()
  else void store.refresh()
}
function onScroll(event: Event) {
  const list = event.currentTarget as HTMLElement
  if (!store.loadError && list.scrollTop + list.clientHeight >= list.scrollHeight - 32) void store.loadMore()
}
function followLink(url: string) {
  if (url.startsWith('/')) {
    open.value = false
    void router.push(url)
  } else window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
:global(.announcement-drawer .el-drawer__body) { overflow: hidden; padding: 0; }
:global(.announcement-drawer .el-drawer__header) { margin: 0; padding: 20px; border-bottom: 1px solid var(--color-border); }
:global(.announcement-drawer .el-drawer__footer) { border-top: 1px solid var(--color-border); padding: 12px 18px; }
.drawer-heading { display: flex; align-items: center; gap: 12px; color: var(--color-text); }
.drawer-heading > .el-icon { font-size: 23px; color: var(--color-primary-hover); }
.drawer-heading h2 { margin: 0; font-size: 20px; }
.drawer-heading p { margin: 5px 0 0; font-size: 13px; color: var(--color-text-muted); }
.scroll-area { height: 100%; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
.scroll-area > * { flex: none; }
.scroll-area > .el-button { align-self: flex-start; }
.feedback { padding: 16px; display: grid; justify-items: center; gap: 12px; color: var(--color-text-muted); }
.body-text { white-space: pre-wrap; word-break: break-word; margin: 6px 0; line-height: 1.65; }
.group-footer { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 14px; }
.group-footer span { margin-inline-end: auto; user-select: text; }
.group-footer a { color: var(--color-primary-hover); font-weight: 600; }
@media (max-width: 560px) { :global(.announcement-drawer.el-drawer) { width: 100vw !important; } }
</style>
