<template>
  <section class="auth-form page-card">
    <h1>{{ app.t('auth.loginHeroTitle') }}</h1>
    <p>{{ app.t('auth.loginHeroSubtitle') }}</p>
    <el-form :model="form" label-position="top" @submit.prevent="submit">
      <el-form-item :label="app.t('auth.account')">
        <el-input v-model="form.username" autocomplete="username" @input="clearLoginError" />
      </el-form-item>
      <el-form-item :label="app.t('auth.password')">
        <el-input v-model="form.password" type="password" autocomplete="current-password" show-password @input="clearLoginError" />
      </el-form-item>
      <p v-if="loginError" class="login-error">{{ loginError }}</p>
      <el-button type="primary" native-type="submit" class="soft-button" size="large" :loading="auth.loading">{{ app.t('common.login') }}</el-button>
    </el-form>
    <router-link to="/register">{{ app.t('auth.noAccount') }}</router-link>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { ApiError } from '@/types/api'

const app = useAppStore()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = reactive({ username: '', password: '' })
const loginError = ref('')

function clearLoginError() {
  loginError.value = ''
}

async function submit() {
  loginError.value = ''
  if (!form.username || !form.password) return ElMessage.warning(app.t('auth.account'))
  try {
    await auth.login(form)
    router.push(String(route.query.redirect || '/playground'))
  } catch (error) {
    loginError.value = (error as ApiError).message || app.t('auth.loginFailed')
  }
}
</script>

<style scoped>
.auth-form { width: min(440px, 100%); padding: 32px; display: grid; gap: 18px; }
h1 { margin: 0; font-size: 40px; }
p { margin: 0; color: var(--color-text-muted); }
.login-error { margin: -6px 0 0; color: var(--color-danger); font-size: 13px; line-height: 1.5; }
.el-button { width: 100%; }
a { color: var(--color-primary); font-weight: 700; text-align: center; }
</style>
