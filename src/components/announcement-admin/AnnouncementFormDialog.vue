<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, type UploadRequestOptions } from 'element-plus'
import AnnouncementCard from '@/components/notices/AnnouncementCard.vue'
import type { AnnouncementItem } from '@/services/announcements'
import {
  announcementCategories, announcementFields, createAnnouncement, setAnnouncementStatus, updateAnnouncement,
  uploadAnnouncementCover, type AdminAnnouncementDetail,
} from '@/services/adminAnnouncements'
import { useAnnouncementAdmin } from './presentation'

const props = defineProps<{ item?: AdminAnnouncementDetail }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const { app, t, report, confirm } = useAnnouncementAdmin()
const current = ref(props.item)
const fields = reactive(announcementFields(props.item))
const saving = ref(false)
const uploading = ref(false)
const preview = computed<AnnouncementItem>(() => ({
  ...fields, id: current.value?.id ?? 0, title: fields.title || t('title'), summary: fields.summary || t('summary'),
  publishedAt: current.value?.publishedAt, hasDetail: Boolean(fields.content || (fields.linkText && fields.linkUrl)),
}))
async function upload({ file }: UploadRequestOptions) {
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.warning(t('coverLimit'))
    return
  }
  uploading.value = true
  try { fields.coverUrl = (await uploadAnnouncementCover(file)).url }
  catch (e) { ElMessage.error((e as Error).message || t('failed')) }
  finally { uploading.value = false }
}
async function submit(publish: boolean) {
  if (saving.value || uploading.value) return
  if (!fields.title.trim() || !fields.summary.trim()) return ElMessage.warning(t('requiredTitleSummary'))
  if (Boolean(fields.linkText.trim()) !== Boolean(fields.linkUrl.trim())) return ElMessage.warning(t('linkPair'))
  saving.value = true
  try {
    if (publish && !await confirm('publish', current.value?.publishedAt ? 'confirmRepublish' : 'confirmPublish')) return
    if (current.value) {
      current.value = await updateAnnouncement(current.value.id, fields, current.value.revision)
      // Editing and publishing an existing draft are separate writes, each conditional on its own revision.
      if (publish) {
        emit('changed')
        await setAnnouncementStatus(current.value.id, 1, current.value.revision)
      }
    } else {
      await createAnnouncement(fields, publish ? 1 : 0)
    }
    ElMessage.success(t('saved'))
    emit('changed')
    emit('close')
  } catch (e) {
    report(e, () => { emit('changed'); emit('close') })
  } finally { saving.value = false }
}
function close() { if (!saving.value) emit('close') }
</script>
<template>
  <el-dialog :model-value="true" :title="current ? t('edit') : t('new')" width="min(920px, 94vw)"
    :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @close="close">
    <div class="editor-grid">
      <el-form label-position="top" :disabled="saving" @submit.prevent>
        <el-form-item :label="t('title')" required><el-input v-model="fields.title" :aria-label="t('title')" maxlength="80" /></el-form-item>
        <el-form-item :label="t('summary')" required><el-input v-model="fields.summary" :aria-label="t('summary')" maxlength="200" /></el-form-item>
        <el-form-item :label="t('content')"><el-input v-model="fields.content" :aria-label="t('content')" type="textarea" :rows="5" maxlength="5000" show-word-limit /></el-form-item>
        <el-form-item :label="t('cover')">
          <el-upload accept="image/jpeg,image/png,image/webp" :http-request="upload" :show-file-list="false" :disabled="uploading || saving">
            <el-button :loading="uploading" :disabled="saving">{{ t('uploadCover') }}</el-button>
          </el-upload>
          <el-button v-if="fields.coverUrl" link :disabled="uploading" @click="fields.coverUrl = ''">{{ t('removeCover') }}</el-button>
          <small>{{ t('coverHint') }}</small>
        </el-form-item>
        <div class="field-pair">
          <el-form-item :label="t('category')" required>
            <el-select v-model="fields.category" :aria-label="t('category')"><el-option v-for="c in announcementCategories" :key="c" :value="c" :label="app.t(`notices.categories.${c}`)" /></el-select>
          </el-form-item>
          <el-form-item :label="t('version')"><el-input v-model="fields.versionLabel" maxlength="20" /></el-form-item>
        </div>
        <div class="switches">
          <el-checkbox v-model="fields.isPinned">{{ app.t('notices.pinned') }}</el-checkbox>
          <el-checkbox v-model="fields.isImportant">{{ app.t('notices.important') }}</el-checkbox>
        </div>
        <el-form-item :label="t('linkText')"><el-input v-model="fields.linkText" maxlength="20" /></el-form-item>
        <el-form-item :label="t('linkUrl')"><el-input v-model="fields.linkUrl" maxlength="500" :placeholder="t('linkHint')" /></el-form-item>
      </el-form>
      <aside class="preview"><h3>{{ t('cardPreview') }}</h3><AnnouncementCard :item="preview" preview /></aside>
    </div>
    <template #footer>
      <el-button :disabled="saving" @click="close">{{ app.t('common.cancel') }}</el-button>
      <el-button :type="current?.status === 1 ? 'primary' : 'default'" :disabled="uploading || saving" @click="submit(false)">
        {{ current && current.status !== 0 ? app.t('common.save') : t('saveDraft') }}
      </el-button>
      <el-button v-if="current?.status !== 1" type="primary" :disabled="uploading || saving" @click="submit(true)">{{ t('publish') }}</el-button>
    </template>
  </el-dialog>
</template>
<style scoped>
.editor-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 28px; }
.field-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.switches { display: flex; margin-bottom: 12px; }
.preview { align-self: start; position: sticky; top: 16px; min-width: 0; }
.preview h3 { margin: 0 0 12px; font-size: 1rem; }
small { display: block; width: 100%; color: var(--color-text-muted); }
@media (max-width: 700px) { .editor-grid { grid-template-columns: 1fr; gap: 12px; } .preview { position: static; } }
</style>
