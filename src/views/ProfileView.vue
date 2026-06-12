<template>
  <div>
    <section class="profile-card page-card">
      <el-avatar :size="92" :src="avatarSrc">{{ auth.user?.email?.[0]?.toUpperCase() }}</el-avatar>
      <div class="profile-summary">
        <strong>{{ nickname }}</strong>
        <span>{{ auth.user?.email || 'user@example.com' }}</span>
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
        <el-form-item :label="app.t('auth.password')"><el-input v-model="passwordForm.oldPassword" type="password" show-password /></el-form-item>
        <el-form-item :label="app.t('profile.changePassword')"><el-input v-model="passwordForm.newPassword" type="password" show-password /></el-form-item>
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
const passwordForm = reactive({ oldPassword: '', newPassword: '' })
const nickname = computed(() => auth.user?.displayName || auth.user?.username || auth.user?.email || '-')
const avatarSrc = computed(() => normalizeAvatarUrl(auth.user?.avatarUrl))

function normalizeAvatarUrl(url?: string) {
  if (!url) return ''
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/api/')) return url
  return `/api${url.startsWith('/') ? url : `/${url}`}`
}

watch(
  () => auth.user?.displayName,
  (displayName) => {
    nicknameForm.displayName = displayName || ''
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
    await updateNickname(auth.user.id, { nickname: displayName, username: displayName })
    await auth.fetchCurrentUser()
    ElMessage.success(app.t('profile.nicknameUpdated'))
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    nicknameSaving.value = false
  }
}

async function changePassword() {
  if (!auth.user?.id) return
  try {
    await updatePassword(auth.user.id, passwordForm)
    ElMessage.success(app.t('common.save'))
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
span { color: var(--color-text-muted); }
</style>
