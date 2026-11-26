<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import QqGroupDialog from '@/components/notices/QqGroupDialog.vue'
import { getCommunity, saveCommunity, type AdminCommunity, type CommunityFields } from '@/services/adminAnnouncements'
import { useAnnouncementAdmin } from './presentation'

const { app, t, date, report } = useAnnouncementAdmin()
const saved = ref<AdminCommunity>()
const fields = ref<CommunityFields>()
const bump = ref(false)
const bumpTouched = ref(false)
const saving = ref(false)
const loading = ref(false)
const error = ref('')
const preview = ref(false)
function apply(value: AdminCommunity) {
  saved.value = value
  const { enabled, title, description, groupName, groupNumber, joinUrl, remindIntervalDays } = value
  fields.value = { enabled, title, description, groupName, groupNumber, joinUrl: joinUrl ?? '', remindIntervalDays }
  bump.value = bumpTouched.value = false
}
// The default follows the group number until the admin makes their own choice.
function syncBump() {
  if (fields.value && saved.value && !bumpTouched.value) bump.value = fields.value.groupNumber.trim() !== saved.value.groupNumber
}
async function reload() {
  loading.value = true
  error.value = ''
  try { apply(await getCommunity()) }
  catch (e) { error.value = (e as Error).message || t('failed') }
  finally { loading.value = false }
}
onMounted(reload)
async function save() {
  const value = fields.value
  if (!value || !saved.value || saving.value) return
  if (!value.title.trim() || !value.description.trim()) return ElMessage.warning(t('requiredCopy'))
  if (value.enabled && (!value.groupName.trim() || !value.groupNumber.trim())) return ElMessage.warning(t('requiredGroup'))
  if (value.groupNumber && !/^[1-9][0-9]{4,11}$/.test(value.groupNumber.trim())) return ElMessage.warning(t('groupNumberInvalid'))
  if (!Number.isInteger(value.remindIntervalDays) || value.remindIntervalDays < 1 || value.remindIntervalDays > 30) return ElMessage.warning(t('intervalHint'))
  saving.value = true
  try {
    apply(await saveCommunity(value, saved.value.revision, bump.value))
    ElMessage.success(t('saved'))
  } catch (e) { report(e, reload) }
  finally { saving.value = false }
}
</script>
<template>
  <p v-if="loading" role="status">{{ app.t('common.loading') }}</p>
  <p v-else-if="error" role="alert">{{ error }} <el-button @click="reload">{{ app.t('common.retry') }}</el-button></p>
  <el-form v-else-if="fields && saved" class="qq-settings" :disabled="saving" label-position="top" @submit.prevent="save">
    <el-form-item :label="t('enabled')"><el-switch v-model="fields.enabled" :aria-label="t('enabled')" /></el-form-item>
    <div class="field-pair">
      <el-form-item :label="t('groupName')" :required="fields.enabled"><el-input v-model="fields.groupName" maxlength="50" /></el-form-item>
      <el-form-item :label="t('groupNumber')" :required="fields.enabled"><el-input v-model="fields.groupNumber" maxlength="12" inputmode="numeric" @input="syncBump" /></el-form-item>
    </div>
    <el-form-item :label="t('joinUrl')"><el-input v-model="fields.joinUrl" maxlength="500" placeholder="https://qm.qq.com/q/…" /></el-form-item>
    <el-form-item :label="t('popupTitle')" required><el-input v-model="fields.title" maxlength="40" /></el-form-item>
    <el-form-item :label="t('description')" required><el-input v-model="fields.description" maxlength="200" /></el-form-item>
    <el-form-item :label="t('interval')" required><el-input-number v-model="fields.remindIntervalDays" :min="1" :max="30" :step="1" step-strictly /></el-form-item>
    <el-checkbox v-model="bump" @change="bumpTouched = true">{{ t('bump') }}</el-checkbox>
    <p v-if="fields.groupNumber.trim() !== saved.groupNumber" class="note">{{ t('bumpHint') }}</p>
    <p class="note">{{ t('lastModified') }} · {{ date(saved.updatedAt) }} · {{ saved.updatedByName || saved.updatedBy || '—' }}</p>
    <div class="buttons"><el-button @click="preview = true">{{ t('popupPreview') }}</el-button><el-button type="primary" native-type="submit" :loading="saving">{{ app.t('common.save') }}</el-button></div>
    <QqGroupDialog v-model="preview" :config="{ ...fields, promptVersion: saved.promptVersion }" preview />
  </el-form>
</template>
<style scoped>
.qq-settings { max-width: 620px; }
.field-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.note { color: var(--color-text-muted); font-size: .85rem; }
.buttons { display: flex; margin-top: 20px; }
@media (max-width: 600px) { .field-pair { grid-template-columns: 1fr; gap: 0; } }
</style>
