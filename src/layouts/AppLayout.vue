<template>
  <main class="app-layout">
    <aside class="sidebar page-card">
      <AppLogo />
      <nav class="primary-nav">
        <router-link v-for="item in visibleNavItems" :key="item.to" :to="item.to">{{ app.t(item.label) }}</router-link>
      </nav>
      <div class="sidebar-footer">
        <LegalLinks />
        <div class="account-card">
          <div class="account-identity">
            <button class="account-trigger" type="button" @click="openSettings">{{ nickname }}</button>
            <MonthlyVipBadge :membership="auth.user?.membership" />
          </div>
          <button class="settings-link" type="button" @click="openSettings">{{ app.t('profile.clickSettings') }}</button>
          <span>{{ app.t('profile.currentCredits') }}: {{ credits.summary.balance }}</span>
          <el-button class="logout-button" text @click="handleLogout">{{ app.t('common.logout') }}</el-button>
        </div>
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
          <div class="mobile-vip-status">
            <MonthlyVipBadge :membership="auth.user?.membership" />
          </div>
          <el-button type="primary" class="soft-button" :loading="credits.signingIn" :disabled="credits.summary.checkedInToday" @click="checkIn">
            {{ credits.summary.checkedInToday ? app.t('credits.checkedInToday') : app.t('credits.checkIn') }}
          </el-button>
          <el-button type="primary" class="soft-button recharge-entry" @click="router.push({ name: 'recharge' })">
            <el-icon><Coin /></el-icon>
            <span>{{ credits.summary.balance }} | {{ app.t('recharge.entry') }}</span>
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
        <div class="drawer-account">
          <div class="account-identity">
            <strong>{{ nickname }}</strong>
            <MonthlyVipBadge :membership="auth.user?.membership" />
          </div>
          <button class="settings-link" type="button" @click="openDrawerSettings">{{ app.t('profile.clickSettings') }}</button>
        </div>
        <router-link v-for="item in visibleNavItems" :key="item.to" :to="item.to" @click="drawer = false">{{ app.t(item.label) }}</router-link>
        <LegalLinks class="drawer-legal" />
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
          <el-input v-model="passwordForm.password" type="password" show-password autocomplete="new-password" />
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Coin } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import AppLogo from '@/components/common/AppLogo.vue'
import LegalLinks from '@/components/common/LegalLinks.vue'
import LocaleToggle from '@/components/common/LocaleToggle.vue'
import MonthlyVipBadge from '@/components/common/MonthlyVipBadge.vue'
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
const passwordForm = reactive({ password: '', confirmPassword: '' })
const nickname = computed(() => auth.user?.nickName || auth.user?.userName || '-')
const accountName = computed(() => auth.user?.userName || '-')
const pageTitle = computed(() => app.t(String(route.meta.titleKey || 'app.name')))
const pageSubtitle = computed(() => route.meta.subtitleKey ? app.t(String(route.meta.subtitleKey)) : '')

const navItems = [
  { to: '/canvas', label: 'nav.canvas' },
  { to: '/playground', label: 'nav.playground' },
  { to: '/images', label: 'nav.gallery' },
  { to: '/credits', label: 'nav.credits' },
  { to: '/pricing', label: 'nav.pricing' },
  { to: '/admin/redeem-codes', label: 'nav.codeGenerator', superAdminOnly: true },
  { to: '/profile', label: 'nav.profile' },
]
const visibleNavItems = computed(() => navItems.filter((item) => !item.superAdminOnly || auth.user?.isSuperAdmin))

onMounted(() => {
  auth.ensureCurrentUser().catch(() => undefined)
  credits.fetchSummary().catch(() => undefined)
  document.addEventListener('visibilitychange', refreshVisibleBalance)
})

onBeforeUnmount(() => document.removeEventListener('visibilitychange', refreshVisibleBalance))

watch(() => auth.token, (token, previousToken) => {
  if (token && token !== previousToken) {
    credits.activateForUser(auth.user?.id ?? null, auth.user?.pointBalance)
    void credits.fetchSummary().catch(() => undefined)
  }
})

function refreshVisibleBalance() {
  if (document.visibilityState === 'visible') void credits.fetchSummary().catch(() => undefined)
}

function openSettings() {
  settingsVisible.value = true
}

function openDrawerSettings() {
  drawer.value = false
  openSettings()
}

function openNicknameDialog() {
  nicknameForm.displayName = auth.user?.nickName || ''
  settingsVisible.value = false
  nicknameVisible.value = true
}

function openPasswordDialog() {
  passwordForm.password = ''
  passwordForm.confirmPassword = ''
  settingsVisible.value = false
  passwordVisible.value = true
}

function handleEditClosed() {
  settingsVisible.value = true
}

async function saveNickname() {
  if (!auth.user?.id) return
  const displayName = nicknameForm.displayName.trim()
  if (!displayName) return ElMessage.warning(app.t('profile.nicknameRequired'))
  nicknameSaving.value = true
  try {
    await updateNickname(auth.user.id, { nickName: displayName, userName: auth.user.userName })
    ElMessage.success(app.t('profile.nicknameUpdated'))
    nicknameVisible.value = false
    auth.clearSession()
    await router.push('/login')
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    nicknameSaving.value = false
  }
}

async function savePassword() {
  if (!auth.user?.id) return
  if (!passwordForm.password) return ElMessage.warning(app.t('profile.passwordRequired'))
  if (passwordForm.password !== passwordForm.confirmPassword) return ElMessage.warning(app.t('auth.confirmPassword'))
  passwordSaving.value = true
  try {
    await updatePassword(auth.user.id, { password: passwordForm.password })
    ElMessage.success(app.t('profile.passwordUpdated'))
    passwordVisible.value = false
    auth.clearSession()
    await router.push('/login')
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
  } catch {
    ElMessage.error(app.t('credits.checkInFailed'))
  }
}

async function handleLogout() {
  await auth.logout()
  credits.activateForUser(null)
  await router.replace('/login')
}
</script>

<style scoped>
.app-layout { min-height: 100vh; max-width: 100vw; overflow-x: hidden; display: grid; grid-template-columns: minmax(0, 240px) minmax(0, 1fr); gap: 24px; padding: 24px; background: radial-gradient(circle at top right, rgba(111,127,63,.12), transparent 34%), var(--color-bg); }
.sidebar { position: sticky; top: 24px; min-width: 0; height: calc(100vh - 48px); padding: 20px; overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: 28px; }
.primary-nav, .drawer-content { display: grid; gap: 8px; }
.primary-nav { flex: 0 0 auto; }
.primary-nav > a, .drawer-content > a { padding: 12px 14px; border-radius: var(--radius-md); color: var(--color-text-muted); font-weight: 600; }
.primary-nav > a.router-link-active, .drawer-content > a.router-link-active { background: var(--color-primary-soft); color: var(--color-primary-hover); }
.sidebar-footer { flex: 0 0 auto; margin-top: auto; display: grid; gap: 12px; }
.account-card { padding: 14px; border-radius: var(--radius-md); background: var(--color-primary-soft); display: grid; gap: 4px; }
.account-card > span { color: var(--color-text-muted); font-size: 13px; }
.account-identity { min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.account-trigger { min-width: 0; padding: 0; overflow-wrap: anywhere; border: 0; background: transparent; color: var(--color-text); text-align: left; font-weight: 700; cursor: pointer; }
.settings-link { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--color-primary-hover); font-size: 12px; cursor: pointer; }
.settings-link:hover, .account-trigger:hover { text-decoration: underline; }
.settings-link:focus-visible, .account-trigger:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; border-radius: 2px; }
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
.mobile-vip-status { display: none; align-items: center; }
.recharge-entry { white-space: nowrap; }
.mobile-menu { display: none; margin-right: auto; }
.drawer-content { padding: 8px; }
.drawer-account { min-width: 0; margin: 4px 6px 10px; padding: 10px 8px 14px; display: grid; gap: 5px; border-bottom: 1px solid var(--color-border); }
.drawer-legal { margin-top: 18px; padding: 12px 14px; border-top: 1px solid var(--color-border); }
@media (max-width: 900px) { .app-layout { grid-template-columns: 1fr; padding: 16px 16px 88px; } .sidebar { display: none; } .mobile-menu { display: inline-flex; } .topbar { gap: 8px; flex-wrap: wrap; min-height: 0; } .topbar-title { order: 3; width: 100%; } .topbar-actions { flex-wrap: wrap; justify-content: flex-end; } .mobile-vip-status { display: flex; } }
@media (max-width: 560px) { .topbar-actions { width: 100%; justify-content: flex-start; margin-left: 0; } }
</style>
