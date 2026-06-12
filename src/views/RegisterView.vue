<template>
  <section class="auth-form page-card">
    <h1>{{ app.t('auth.createAccount') }}</h1>
    <p>{{ app.t('auth.registerSubtitle') }}</p>
    <el-form :model="form" label-position="top">
      <el-form-item :label="app.t('auth.email')"><el-input v-model="form.email" autocomplete="email" /></el-form-item>
      <el-form-item :label="app.t('auth.verificationCode')">
        <div class="code-row"><el-input v-model="form.verificationCode" /><el-button :disabled="countdown > 0" @click="sendCode">{{ countdown || app.t('auth.sendCode') }}</el-button></div>
      </el-form-item>
      <el-form-item :label="app.t('auth.password')"><el-input v-model="form.password" type="password" show-password /></el-form-item>
      <el-form-item :label="app.t('auth.confirmPassword')"><el-input v-model="confirmPassword" type="password" show-password /></el-form-item>
      <el-button type="primary" class="soft-button" size="large" :loading="loading" @click="submit">{{ app.t('common.register') }}</el-button>
    </el-form>
    <router-link to="/login">{{ app.t('auth.haveAccount') }}</router-link>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { sendEmailCode } from '@/services/auth'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { ApiError } from '@/types/api'

const app = useAppStore()
const auth = useAuthStore()
const router = useRouter()
const form = reactive({ email: '', password: '', verificationCode: '' })
const confirmPassword = ref('')
const loading = ref(false)
const countdown = ref(0)
let timer: number | undefined

async function sendCode() {
  if (!form.email) return ElMessage.warning(app.t('auth.email'))
  await sendEmailCode(form.email)
  countdown.value = 60
  timer = window.setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && timer) window.clearInterval(timer)
  }, 1000)
}

async function submit() {
  if (form.password !== confirmPassword.value) return ElMessage.warning(app.t('auth.confirmPassword'))
  loading.value = true
  try {
    await auth.register({
      email: form.email,
      password: form.password,
      EmailCode: form.verificationCode,
      username: form.email,
      nickname: form.email,
    })
    auth.clearSession()
    await ElMessageBox.alert('您已成功注册！请登录后开始创作吧！', app.t('common.register'), {
      confirmButtonText: app.t('common.confirm'),
      type: 'success',
      showClose: false,
      closeOnClickModal: false,
      closeOnPressEscape: false,
    })
    router.push('/login')
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-form { width: min(440px, 100%); padding: 32px; display: grid; gap: 18px; }
h1 { margin: 0; font-size: 40px; }
p { margin: 0; color: var(--color-text-muted); }
.code-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; width: 100%; }
.el-button[type='button'], .auth-form > .el-button { width: 100%; }
a { color: var(--color-primary); font-weight: 700; text-align: center; }
</style>
