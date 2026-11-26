<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { announcementCategoryColors } from '@/services/announcements'
import { useAdminRead } from '@/components/admin-users/useAdminRead'
import AnnouncementFormDialog from '@/components/announcement-admin/AnnouncementFormDialog.vue'
import QqGroupSettingForm from '@/components/announcement-admin/QqGroupSettingForm.vue'
import { useAnnouncementAdmin } from '@/components/announcement-admin/presentation'
import {
  announcementFields, deleteAnnouncement, getAnnouncement, listAnnouncements, setAnnouncementStatus,
  updateAnnouncement, type AdminAnnouncement, type AdminAnnouncementDetail, type AnnouncementStatus,
} from '@/services/adminAnnouncements'

const { t, app, date, report, confirm } = useAnnouncementAdmin()
const route = useRoute()
const router = useRouter()
const tab = computed({
  get: () => route.query.tab === 'qq-group' ? 'qq-group' : 'announcements',
  set: (value: string) => { void router.replace({ query: { ...route.query, tab: value } }) },
})
const status = ref<AnnouncementStatus | ''>('')
const search = ref('')
const keyword = ref('')
const page = ref(1)
let debounce: ReturnType<typeof setTimeout>
watch(search, value => {
  clearTimeout(debounce)
  debounce = setTimeout(() => { keyword.value = value.trim(); page.value = 1 }, 300)
})
onScopeDispose(() => clearTimeout(debounce))
watch(status, () => { page.value = 1 })
const query = computed(() => tab.value === 'announcements'
  ? { pageIndex: page.value, pageSize: 20, keyword: keyword.value || undefined, status: status.value === '' ? undefined : status.value }
  : null)
const { data, loading, error, reload } = useAdminRead(query, listAnnouncements)
watch(data, value => {
  if (value) page.value = Math.min(page.value, Math.max(1, Math.ceil(value.total / 20)))
})
const editing = ref<AdminAnnouncementDetail>()
const editorOpen = ref(false)
const busy = ref(false)
function newAnnouncement() { editing.value = undefined; editorOpen.value = true }
function stateLabel(s: AnnouncementStatus) { return t(['draft', 'published', 'offline'][s]) }
async function act(row: AdminAnnouncement, action: 'edit' | 'pin' | 'status' | 'delete') {
  if (busy.value) return
  busy.value = true
  try {
    if (action === 'edit') {
      editing.value = await getAnnouncement(row.id)
      editorOpen.value = true
      return
    }
    if (action === 'delete') {
      if (!await confirm('delete', 'confirmDelete')) return
      await deleteAnnouncement(row.id, row.revision)
    } else if (action === 'status') {
      const publish = row.status !== 1
      const message = publish ? (row.publishedAt ? 'confirmRepublish' : 'confirmPublish') : 'confirmOffline'
      if (!await confirm(publish ? 'publish' : 'takeOffline', message)) return
      await setAnnouncementStatus(row.id, publish ? 1 : 2, row.revision)
    } else {
      const detail = await getAnnouncement(row.id)
      await updateAnnouncement(row.id, { ...announcementFields(detail), isPinned: !row.isPinned }, row.revision)
    }
    ElMessage.success(t('saved'))
    reload()
  } catch (e) { report(e, reload) }
  finally { busy.value = false }
}
</script>
<template>
  <section class="page-card notice-admin">
    <el-tabs v-model="tab">
      <el-tab-pane name="announcements" :label="t('announcements')">
        <div class="toolbar">
          <el-input v-model="search" type="search" class="search" :aria-label="t('search')" :placeholder="t('search')" maxlength="80" clearable />
          <el-select v-model="status" class="status" :aria-label="t('status')">
            <el-option value="" :label="t('allStatus')" />
            <el-option v-for="s in ([0,1,2] as const)" :key="s" :value="s" :label="stateLabel(s)" />
          </el-select>
          <el-button class="new" type="primary" :disabled="busy" @click="newAnnouncement">{{ t('new') }}</el-button>
        </div>
        <p v-if="loading" role="status">{{ app.t('common.loading') }}</p>
        <p v-else-if="error" role="alert">{{ error.message }} <el-button @click="reload">{{ app.t('common.retry') }}</el-button></p>
        <template v-else-if="data">
          <div class="table-scroll"><table>
            <thead><tr><th v-for="key in ['cover','title','status','publishedAt','lastModified','actions']" :key="key">{{ t(key) }}</th></tr></thead>
            <tbody><tr v-for="row in data.items" :key="row.id">
              <td><img v-if="row.coverUrl" class="thumb" :src="row.coverUrl" alt="" loading="lazy" /></td>
              <td class="title-cell"><strong>{{ row.title }}</strong><div class="tags">
                <el-tag v-if="row.isPinned" size="small">{{ app.t('notices.pinned') }}</el-tag>
                <el-tag v-if="row.isImportant" size="small" type="danger">{{ app.t('notices.important') }}</el-tag>
                <el-tag size="small" :type="announcementCategoryColors[row.category]">{{ app.t(`notices.categories.${row.category}`) }}</el-tag>
                <el-tag v-if="row.versionLabel" size="small" type="info">{{ row.versionLabel }}</el-tag>
              </div></td>
              <td><el-tag :type="row.status === 1 ? 'success' : row.status === 2 ? 'warning' : 'info'">{{ stateLabel(row.status) }}</el-tag></td>
              <td>{{ date(row.publishedAt) }}</td>
              <td>{{ date(row.updatedAt ?? row.createdAt) }}<small>{{ row.updatedByName || row.updatedBy || row.createdByName || row.createdBy }}</small></td>
              <td><div class="actions">
                <el-button link :disabled="busy" @click="act(row, 'edit')">{{ app.t('common.edit') }}</el-button>
                <el-button link :disabled="busy" @click="act(row, 'status')">{{ t(row.status === 1 ? 'takeOffline' : 'publish') }}</el-button>
                <el-button link :disabled="busy" @click="act(row, 'pin')">{{ t(row.isPinned ? 'unpin' : 'pin') }}</el-button>
                <el-button v-if="row.status !== 1" link type="danger" :disabled="busy" @click="act(row, 'delete')">{{ app.t('common.delete') }}</el-button>
              </div></td>
            </tr></tbody>
          </table></div>
          <el-empty v-if="!data.items.length" :description="t('empty')" />
          <el-pagination v-if="data.total > 20" v-model:current-page="page" :page-size="20" :total="data.total" layout="prev, pager, next" />
        </template>
      </el-tab-pane>
      <el-tab-pane name="qq-group" :label="t('qqGroup')"><QqGroupSettingForm v-if="tab === 'qq-group'" /></el-tab-pane>
    </el-tabs>
    <AnnouncementFormDialog v-if="editorOpen" :item="editing" @close="editorOpen = false" @changed="reload" />
  </section>
</template>
<style scoped>
.notice-admin { min-width: 0; padding: clamp(14px, 3vw, 24px); }
.toolbar, .tags, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.toolbar { margin: 4px 0 18px; }
.search { width: min(270px, 100%); }
.status { width: 135px; }
.new { margin-inline-start: auto; }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; text-align: start; }
th, td { padding: 12px 8px; text-align: start; border-bottom: 1px solid var(--color-border); }
th, small { color: var(--color-text-muted); }
th { font-size: .8rem; white-space: nowrap; }
td { font-size: .9rem; }
small { display: block; margin-top: 4px; }
.thumb { width: 72px; aspect-ratio: 20 / 9; object-fit: cover; border-radius: 6px; }
.title-cell { min-width: 160px; overflow-wrap: anywhere; }
.tags { gap: 4px; margin-top: 6px; }
.actions { min-width: 105px; }
.actions .el-button { margin: 0; }
.el-pagination { margin-top: 16px; }
</style>
