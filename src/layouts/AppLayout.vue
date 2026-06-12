<template>
  <main class="app-layout">
    <aside class="sidebar page-card">
      <AppLogo />
      <nav>
        <router-link v-for="item in navItems" :key="item.to" :to="item.to">{{ app.t(item.label) }}</router-link>
      </nav>
      <div class="account-card">
        <strong class="account-trigger" @click="openSettings">{{ nickname }}</strong>
        <button class="settings-link" type="button" @click="openSettings">{{ app.t('profile.clickSettings') }}</button>
        <span>{{ app.t('profile.currentCredits') }}: {{ credits.summary.balance }}</span>
        <el-button class="logout-button" text @click="handleLogout">{{ app.t('common.logout') }}</el-button>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <el-button class="mobile-menu" plain @click="drawer = true">Menu</el-button>
        <div class="topbar-title">
          <h1>{{ pageTitle }}</h1>
          <p v-if="pageSubtitle">{{ pageSubtitle }}</p>
        </div>
        <div class="topbar-actions">
          <el-button type="primary" class="soft-button" :loading="credits.signingIn" :disabled="credits.summary.checkedInToday" @click="checkIn">
            {{ credits.summary.checkedInToday ? app.t('credits.checkedInToday') : app.t('credits.checkIn') }}
          </el-button>
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>
      <router-view />
    </section>

    <el-drawer v-model="drawer" size="280px" direction="ltr">
      <div class="drawer-content">
        <AppLogo />
        <router-link v-for="item in navItems" :key="item.to" :to="item.to" @click="drawer = false">{{ app.t(item.label) }}</router-link>
      </div>
    </el-drawer>

    <el-dialog v-model="settingsVisible" :title="app.t('profile.personalSettings')" width="420px">
      <div class="settings-info">
        <div>
          <span>{{ app.t('profile.nickname') }}</span>
          <strong>{{ nickname }}</strong>
        </div>
        <div>
          <span>{{ app.t('profile.accountName') }}</span>
          <strong>{{ accountName }}</strong>
        </div>
        <div>
          <span>{{ app.t('profile.remainingCredits') }}</span>
          <strong>{{ credits.summary.balance }}</strong>
        </div>
      </div>
      <template #footer>
        <el-button @click="openNicknameDialog">{{ app.t('profile.modifyNickname') }}</el-button>
        <el-button type="primary" @click="openPasswordDialog">{{ app.t('profile.modifyPassword') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="nicknameVisible" :title="app.t('profile.modifyNickname')" width="420px" @closed="handleEditClosed">
      <el-form :model="nicknameForm" label-position="top" @submit.prevent>
        <el-form-item :label="app.t('profile.newNickname')">
          <el-input v-model="nicknameForm.displayName" maxlength="40" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="nicknameVisible = false">{{ app.t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="nicknameSaving" @click="saveNickname">{{ app.t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordVisible" :title="app.t('profile.modifyPassword')" width="420px" @closed="handleEditClosed">
      <el-form :model="passwordForm" label-position="top" @submit.prevent>
        <el-form-item :label="app.t('auth.password')">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item :label="app.t('profile.newPassword')">
          <el-input v-model="passwordForm.newPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item :label="app.t('auth.confirmPassword')">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">{{ app.t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="savePassword">{{ app.t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import AppLogo from '@/components/common/AppLogo.vue'
import LocaleToggle from '@/components/common/LocaleToggle.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import { updateNickname, updatePassword } from '@/services/user'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'
import type { ApiError } from '@/types/api'

const app = useAppStore()
const auth = useAuthStore()
const credits = useCreditsStore()
const router = useRouter()
const route = useRoute()
const drawer = ref(false)
const settingsVisible = ref(false)
const nicknameVisible = ref(false)
const passwordVisible = ref(false)
const nicknameSaving = ref(false)
const passwordSaving = ref(false)
const nicknameForm = reactive({ displayName: '' })
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const nickname = computed(() => auth.user?.displayName || auth.user?.username || auth.user?.email || '-')
const accountName = computed(() => auth.user?.email || auth.user?.username || 'user@example.com')
const pageTitle = computed(() => app.t(String(route.meta.titleKey || 'app.name')))
const pageSubtitle = computed(() => route.meta.subtitleKey ? app.t(String(route.meta.subtitleKey)) : '')

const navItems = [
  { to: '/playground', label: 'nav.playground' },
  { to: '/images', label: 'nav.gallery' },
  { to: '/credits', label: 'nav.credits' },
  { to: '/pricing', label: 'nav.pricing' },
  { to: '/profile', label: 'nav.profile' },
]

onMounted(() => {
  auth.fetchCurrentUser().catch(() => undefined)
  credits.fetchSummary().catch(() => undefined)
})

function openSettings() {
  settingsVisible.value = true
}

function openNicknameDialog() {
  nicknameForm.displayName = auth.user?.displayName || ''
  settingsVisible.value = false
  nicknameVisible.value = true
}

function openPasswordDialog() {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  settingsVisible.value = false
  passwordVisible.value = true
}

function handleEditClosed() {
  settingsVisible.value = true
}

async function refreshUserInfo() {
  await auth.fetchCurrentUser().catch(() => undefined)
  await credits.fetchSummary().catch(() => undefined)
}

async function saveNickname() {
  if (!auth.user?.id) return
  const displayName = nicknameForm.displayName.trim()
  if (!displayName) return ElMessage.warning(app.t('profile.nicknameRequired'))
  nicknameSaving.value = true
  try {
    await updateNickname(auth.user.id, { nickname: displayName, username: displayName })
    await refreshUserInfo()
    ElMessage.success(app.t('profile.nicknameUpdated'))
    nicknameVisible.value = false
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    nicknameSaving.value = false
  }
}

async function savePassword() {
  if (!auth.user?.id) return
  if (!passwordForm.newPassword) return ElMessage.warning(app.t('profile.passwordRequired'))
  if (passwordForm.newPassword !== passwordForm.confirmPassword) return ElMessage.warning(app.t('auth.confirmPassword'))
  passwordSaving.value = true
  try {
    await updatePassword(auth.user.id, passwordForm)
    ElMessage.success(app.t('profile.passwordUpdated'))
    passwordVisible.value = false
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    passwordSaving.value = false
  }
}

async function checkIn() {
  try {
    await credits.signIn()
    ElMessage.success(app.t('credits.checkInSuccess'))
  } catch (error) {
    ElMessage.error((error as ApiError).message || app.t('credits.checkInFailed'))
  }
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-layout { min-height: 100vh; max-width: 100vw; overflow-x: hidden; display: grid; grid-template-columns: minmax(0, 240px) minmax(0, 1fr); gap: 24px; padding: 24px; background: radial-gradient(circle at top right, rgba(111,127,63,.12), transparent 34%), var(--color-bg); }
.sidebar { position: sticky; top: 24px; min-width: 0; height: calc(100vh - 48px); padding: 20px; display: flex; flex-direction: column; gap: 28px; }
nav, .drawer-content { display: grid; gap: 8px; }
a { padding: 12px 14px; border-radius: var(--radius-md); color: var(--color-text-muted); font-weight: 600; }
a.router-link-active { background: var(--color-primary-soft); color: var(--color-primary-hover); }
.account-card { margin-top: auto; padding: 14px; border-radius: var(--radius-md); background: var(--color-primary-soft); display: grid; gap: 4px; }
.account-card span { color: var(--color-text-muted); font-size: 13px; }
.account-trigger { cursor: pointer; }
.settings-link { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--color-primary-hover); font-size: 12px; cursor: pointer; }
.settings-link:hover, .account-trigger:hover { text-decoration: underline; }
.logout-button:hover { color: var(--el-color-danger); }
.settings-info { display: grid; gap: 14px; }
.settings-info > div { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.settings-info span { color: var(--color-text-muted); }
.workspace { min-width: 0; }
.topbar { min-height: 76px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.topbar-title { min-width: 0; }
.topbar-title h1 { margin: 0; font-size: clamp(28px, 4vw, 40px); line-height: 1.08; }
.topbar-title p { margin: 10px 0 0; color: var(--color-text-muted); }
.topbar-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.mobile-menu { display: none; margin-right: auto; }
.drawer-content { padding: 8px; }
@media (max-width: 900px) { .app-layout { grid-template-columns: 1fr; padding: 16px 16px 88px; } .sidebar { display: none; } .mobile-menu { display: inline-flex; } .topbar { gap: 8px; flex-wrap: wrap; min-height: 0; } .topbar-title { order: 3; width: 100%; } }
</style>
