<template>
  <section class="auth-form page-card">
    <h1>{{ app.t('auth.createAccount') }}</h1>
    <p>{{ app.t('auth.registerSubtitle') }}</p>
    <el-form :model="form" label-position="top" @submit.prevent="submit">
      <el-form-item :label="app.t('auth.email')"><el-input v-model="form.email" autocomplete="email" /></el-form-item>
      <el-form-item :label="app.t('auth.verificationCode')">
        <div class="code-row">
          <el-input v-model="form.verificationCode" autocomplete="one-time-code" inputmode="numeric" maxlength="6" />
          <el-button native-type="button" :loading="sendingCode" :disabled="countdown > 0 || sendingCode" @click="sendCode">{{ sendCodeLabel }}</el-button>
        </div>
      </el-form-item>
      <el-form-item :label="app.t('auth.password')"><el-input v-model="form.password" type="password" show-password autocomplete="new-password" /></el-form-item>
      <el-button native-type="submit" type="primary" class="soft-button" size="large" :loading="loading" :disabled="!canRegister">{{ app.t('common.register') }}</el-button>
    </el-form>
    <router-link to="/login">{{ app.t('auth.haveAccount') }}</router-link>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
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
const loading = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)
const canRegister = computed(() => Boolean(
  form.email.trim()
  && form.verificationCode.trim()
  && form.password,
))
const sendCodeLabel = computed(() => countdown.value > 0
  ? app.t('auth.resendCodeCountdown').replace('{seconds}', String(countdown.value))
  : app.t('auth.sendCode'))
let timer: number | undefined

async function sendCode() {
  if (sendingCode.value || countdown.value > 0) return
  if (!form.email) return ElMessage.warning(app.t('auth.email'))
  sendingCode.value = true
  try {
    const result = await sendEmailCode({
      email: form.email.trim(),
    })
    form.verificationCode = ''
    startCountdown(result?.retryAfterSeconds)
    ElMessage.success(app.t('auth.emailCodeSent'))
  } catch (error) {
    const apiError = error as ApiError
    if (apiError.retryAfterSeconds !== undefined) {
      startCountdown(apiError.retryAfterSeconds)
      ElMessage.warning(app.t('auth.emailCodeRateLimited').replace('{seconds}', String(countdown.value)))
    } else {
      ElMessage.error(apiError.message || app.t('auth.emailCodeFailed'))
    }
  } finally {
    sendingCode.value = false
  }
}

function startCountdown(seconds: unknown) {
  if (timer) window.clearInterval(timer)
  countdown.value = Math.max(1, Math.ceil(Number(seconds) || 60))
  timer = window.setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && timer) {
      window.clearInterval(timer)
      timer = undefined
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

async function submit() {
  if (!form.email.trim() || !form.verificationCode.trim() || !form.password) {
    return ElMessage.warning(app.t('auth.completeRegistration'))
  }
  loading.value = true
  try {
    const result = await auth.register({
      email: form.email.trim(),
      emailCode: form.verificationCode.trim(),
      password: form.password,
    })
    await ElMessageBox.alert(app.t('auth.registrationSuccess'), app.t('common.register'), {
      confirmButtonText: app.t('common.confirm'),
      type: 'success',
      showClose: false,
      closeOnClickModal: false,
      closeOnPressEscape: false,
    })
    router.push({ path: '/login', query: { account: form.email.trim(), registeredUserId: String(result.userId) } })
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
