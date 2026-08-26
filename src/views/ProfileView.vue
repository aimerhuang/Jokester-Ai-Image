<template>
  <div>
    <section class="profile-card page-card">
      <el-avatar :size="92" :src="avatarSrc">{{ auth.user?.userName?.[0]?.toUpperCase() }}</el-avatar>
      <div class="profile-summary">
        <div class="profile-name">
          <strong>{{ nickname }}</strong>
          <MonthlyVipBadge :membership="auth.user?.membership" />
        </div>
        <span>{{ auth.user?.userName || '-' }}</span>
        <span>{{ app.t('profile.currentCredits') }}: {{ credits.summary.balance }}</span>
      </div>
      <el-upload :auto-upload="false" accept="image/png,image/jpeg,image/webp" :show-file-list="false" :on-change="upload"><el-button>{{ app.t('profile.avatar') }}</el-button></el-upload>
      <el-divider />
      <el-form :model="nicknameForm" label-position="top">
        <el-form-item :label="app.t('profile.nickname')">
          <el-input v-model="nicknameForm.displayName" maxlength="40" show-word-limit />
        </el-form-item>
        <el-button type="primary" :loading="nicknameSaving" @click="changeNickname">{{ app.t('profile.modifyNickname') }}</el-button>
      </el-form>
      <el-divider />
      <el-form :model="passwordForm" label-position="top">
        <el-form-item :label="app.t('profile.newPassword')"><el-input v-model="passwordForm.password" type="password" show-password autocomplete="new-password" /></el-form-item>
        <el-button type="primary" @click="changePassword">{{ app.t('common.save') }}</el-button>
        <el-button @click="logout">{{ app.t('common.logout') }}</el-button>
      </el-form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { useRouter } from 'vue-router'
import MonthlyVipBadge from '@/components/common/MonthlyVipBadge.vue'
import { updateNickname, updatePassword, uploadAvatar } from '@/services/user'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'
import type { ApiError } from '@/types/api'

const app = useAppStore()
const auth = useAuthStore()
const credits = useCreditsStore()
const router = useRouter()
const nicknameSaving = ref(false)
const nicknameForm = reactive({ displayName: '' })
const passwordForm = reactive({ password: '' })
const nickname = computed(() => auth.user?.nickName || auth.user?.userName || '-')
const avatarSrc = computed(() => normalizeAvatarUrl(auth.user?.avatarUrl))

function normalizeAvatarUrl(url?: string | null) {
  if (!url) return ''
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  return url.startsWith('/') ? url : `/${url}`
}

watch(
  () => auth.user?.nickName,
  (nickName) => {
    nicknameForm.displayName = nickName || ''
  },
  { immediate: true },
)

onMounted(() => {
  credits.fetchSummary().catch(() => undefined)
})

async function upload(file: UploadFile) {
  if (!file.raw || !auth.user?.id) return
  try {
    const { url } = await uploadAvatar(auth.user.id, file.raw)
    auth.user = { ...auth.user, avatarUrl: url }
    ElMessage.success(app.t('profile.avatarUpdated'))
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  }
}

async function changeNickname() {
  if (!auth.user?.id) return
  const displayName = nicknameForm.displayName.trim()
  if (!displayName) return ElMessage.warning(app.t('profile.nicknameRequired'))
  nicknameSaving.value = true
  try {
    await updateNickname(auth.user.id, { nickName: displayName, userName: auth.user.userName })
    ElMessage.success(app.t('profile.nicknameUpdated'))
    auth.clearSession()
    await router.push('/login')
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    nicknameSaving.value = false
  }
}

async function changePassword() {
  if (!auth.user?.id) return
  if (!passwordForm.password) return ElMessage.warning(app.t('profile.passwordRequired'))
  try {
    await updatePassword(auth.user.id, passwordForm)
    ElMessage.success(app.t('common.save'))
    auth.clearSession()
    await router.push('/login')
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  }
}

async function logout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.profile-card { max-width: 620px; padding: 28px; display: grid; gap: 18px; }
.profile-summary { display: grid; gap: 6px; }
.profile-name { min-width: 0; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.profile-name strong { overflow-wrap: anywhere; }
.profile-summary > span { color: var(--color-text-muted); }
</style>
