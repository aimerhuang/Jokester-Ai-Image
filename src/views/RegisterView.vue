<template>
  <section class="auth-form page-card">
    <h1>{{ app.t('auth.createAccount') }}</h1>
    <p>{{ app.t('auth.registerSubtitle') }}</p>
    <el-form :model="form" label-position="top">
      <el-form-item class="user-name-field" :label="app.t('auth.userName')" :error="userNameError">
        <el-input
          v-model="form.userName"
          autocomplete="username"
          maxlength="20"
          show-word-limit
          :placeholder="app.t('auth.userNamePlaceholder')"
          @blur="userNameTouched = true"
        />
      </el-form-item>
      <el-form-item :label="app.t('auth.nickName')"><el-input v-model="form.nickName" autocomplete="nickname" /></el-form-item>
      <el-form-item :label="app.t('auth.email')"><el-input v-model="form.email" autocomplete="email" /></el-form-item>
      <el-form-item :label="app.t('auth.captcha')">
        <div class="captcha-row">
          <el-input v-model="captchaAnswer" maxlength="6" autocomplete="off" :placeholder="app.t('auth.captchaPlaceholder')" />
          <button
            class="captcha-image-button"
            type="button"
            :aria-label="app.t('auth.refreshCaptcha')"
            :title="app.t('auth.refreshCaptcha')"
            :disabled="captchaLoading"
            @click="loadCaptcha"
          >
            <img v-if="captchaImageUrl" :src="captchaImageUrl" :alt="app.t('auth.captchaImage')" />
            <el-icon v-else :class="{ 'is-loading': captchaLoading }"><Loading v-if="captchaLoading" /><Refresh v-else /></el-icon>
          </button>
          <el-button
            class="captcha-refresh"
            circle
            :icon="Refresh"
            :loading="captchaLoading"
            :aria-label="app.t('auth.refreshCaptcha')"
            :title="app.t('auth.refreshCaptcha')"
            @click="loadCaptcha"
          />
        </div>
      </el-form-item>
      <el-form-item :label="app.t('auth.verificationCode')">
        <div class="code-row">
          <el-input v-model="form.verificationCode" />
          <el-button :loading="sendingCode" :disabled="countdown > 0 || sendingCode || captchaLoading || !captchaId || !captchaAnswer.trim()" @click="sendCode">{{ countdown || app.t('auth.sendCode') }}</el-button>
        </div>
      </el-form-item>
      <el-form-item :label="app.t('auth.password')"><el-input v-model="form.password" type="password" show-password /></el-form-item>
      <el-form-item :label="app.t('auth.confirmPassword')"><el-input v-model="confirmPassword" type="password" show-password /></el-form-item>
      <div v-if="legalLoading" class="legal-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ app.t('auth.legalLoading') }}</span>
      </div>
      <el-alert v-else-if="legalError" type="error" :closable="false" show-icon>
        <template #title>{{ app.t('auth.legalUnavailable') }}</template>
        <el-button class="legal-retry" link type="primary" @click="loadLegalDocuments">{{ app.t('common.retry') }}</el-button>
      </el-alert>
      <div v-else-if="legalDocuments" class="legal-consents">
        <el-checkbox v-model="acceptedPrivacyPolicy">
          {{ app.t('auth.agreePrivacyPrefix') }}
          <a :href="legalDocuments.privacyPolicy.url" target="_blank" rel="noopener noreferrer" @click.stop>{{ app.t('auth.privacyPolicy') }}</a>
        </el-checkbox>
        <el-checkbox v-model="acceptedTermsOfService">
          {{ app.t('auth.agreeTermsPrefix') }}
          <a :href="legalDocuments.termsOfService.url" target="_blank" rel="noopener noreferrer" @click.stop>{{ app.t('auth.termsOfService') }}</a>
        </el-checkbox>
      </div>
      <el-button type="primary" class="soft-button" size="large" :loading="loading" :disabled="!canRegister" @click="submit">{{ app.t('common.register') }}</el-button>
    </el-form>
    <router-link to="/login">{{ app.t('auth.haveAccount') }}</router-link>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Loading, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { getRegistrationCaptcha, sendEmailCode } from '@/services/auth'
import { getCurrentLegalDocuments } from '@/services/legal'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { ApiError } from '@/types/api'
import type { Locale } from '@/types/app'
import type { CurrentLegalDocuments } from '@/types/legal'

const app = useAppStore()
const auth = useAuthStore()
const router = useRouter()
const USER_NAME_PATTERN = /^(?=[A-Za-z0-9]{6,20}$)(?=.*\d)[A-Za-z][A-Za-z0-9]*$/
const form = reactive({ userName: '', nickName: '', email: '', password: '', verificationCode: '' })
const confirmPassword = ref('')
const userNameTouched = ref(false)
const loading = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)
const captchaId = ref('')
const captchaAnswer = ref('')
const captchaImageUrl = ref('')
const captchaLoading = ref(false)
const legalDocuments = ref<CurrentLegalDocuments | null>(null)
const legalLoading = ref(false)
const legalError = ref(false)
const acceptedPrivacyPolicy = ref(false)
const acceptedTermsOfService = ref(false)
const registrationLegalLocale: Locale = 'zh-CN'
const bundledRegistrationLegalDocuments: CurrentLegalDocuments = {
  privacyPolicy: {
    version: 'privacy-2026-08-13',
    url: '/legal/privacy/index.html',
    effectiveAt: '2026-08-13T00:00:00Z',
    requiresReconsent: false,
  },
  termsOfService: {
    version: 'terms-2026-08-13',
    url: '/legal/terms/index.html',
    effectiveAt: '2026-08-13T00:00:00Z',
    requiresReconsent: false,
  },
  aiProcessingNotice: null,
}
const userNameError = computed(() => (
  userNameTouched.value && !USER_NAME_PATTERN.test(form.userName)
    ? app.t('auth.userNameRule')
    : ''
))
const canRegister = computed(() => Boolean(
  legalDocuments.value?.privacyPolicy.version
  && legalDocuments.value?.privacyPolicy.url
  && legalDocuments.value?.termsOfService.version
  && legalDocuments.value?.termsOfService.url
  && acceptedPrivacyPolicy.value
  && acceptedTermsOfService.value,
))
let timer: number | undefined
let legalRequestId = 0
let captchaRequestId = 0

onMounted(() => {
  void loadLegalDocuments()
  void loadCaptcha()
})

async function loadLegalDocuments() {
  const requestId = ++legalRequestId
  legalLoading.value = true
  legalError.value = false
  legalDocuments.value = null
  try {
    const documents = await getCurrentLegalDocuments(registrationLegalLocale)
    if (requestId !== legalRequestId) return
    if (!documents?.privacyPolicy?.version || !documents.privacyPolicy.url
      || !documents?.termsOfService?.version || !documents.termsOfService.url) {
      throw new Error('Legal documents response is incomplete')
    }
    legalDocuments.value = documents
  } catch (error) {
    if (requestId !== legalRequestId) return
    const status = (error as ApiError).status
    if (status === 401 || status === 404) {
      legalDocuments.value = bundledRegistrationLegalDocuments
    } else {
      legalError.value = true
    }
  } finally {
    if (requestId === legalRequestId) legalLoading.value = false
  }
}

async function sendCode() {
  if (!form.email) return ElMessage.warning(app.t('auth.email'))
  if (!captchaId.value || !captchaAnswer.value.trim()) return ElMessage.warning(app.t('auth.captchaRequired'))
  sendingCode.value = true
  try {
    const result = await sendEmailCode({
      email: form.email.trim(),
      captchaId: captchaId.value,
      captchaAnswer: captchaAnswer.value.trim(),
    })
    countdown.value = Math.max(1, Number(result?.retryAfterSeconds) || 60)
    timer = window.setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0 && timer) {
        window.clearInterval(timer)
        timer = undefined
      }
    }, 1000)
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    sendingCode.value = false
    void loadCaptcha()
  }
}

async function loadCaptcha() {
  const requestId = ++captchaRequestId
  captchaLoading.value = true
  captchaId.value = ''
  captchaAnswer.value = ''
  captchaImageUrl.value = ''
  try {
    const challenge = await getRegistrationCaptcha()
    if (requestId !== captchaRequestId) return
    const mimeType = challenge?.mimeType?.trim().toLowerCase()
    const imageBase64 = challenge?.imageBase64?.replace(/\s+/g, '')
    if (!challenge?.captchaId?.trim() || !mimeType?.startsWith('image/') || !imageBase64) {
      throw new Error('Captcha response is incomplete')
    }
    captchaId.value = challenge.captchaId.trim()
    captchaImageUrl.value = `data:${mimeType};base64,${imageBase64}`
  } catch {
    if (requestId === captchaRequestId) ElMessage.error(app.t('auth.captchaUnavailable'))
  } finally {
    if (requestId === captchaRequestId) captchaLoading.value = false
  }
}

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

async function submit() {
  userNameTouched.value = true
  if (!USER_NAME_PATTERN.test(form.userName)) return ElMessage.warning(app.t('auth.userNameRule'))
  if (!form.nickName.trim() || !form.email.trim() || !form.verificationCode.trim() || !form.password) {
    return ElMessage.warning(app.t('auth.completeRegistration'))
  }
  if (form.password !== confirmPassword.value) return ElMessage.warning(app.t('auth.confirmPassword'))
  if (!legalDocuments.value) return ElMessage.warning(app.t('auth.legalUnavailable'))
  if (!acceptedPrivacyPolicy.value || !acceptedTermsOfService.value) return ElMessage.warning(app.t('auth.acceptLegalRequired'))
  loading.value = true
  try {
    const result = await auth.register({
      userName: form.userName,
      nickName: form.nickName.trim(),
      password: form.password,
      email: form.email.trim(),
      emailCode: form.verificationCode.trim(),
      acceptedPrivacyPolicy: true,
      privacyPolicyVersion: legalDocuments.value.privacyPolicy.version,
      acceptedTermsOfService: true,
      termsOfServiceVersion: legalDocuments.value.termsOfService.version,
      clientPlatform: 'web',
      locale: registrationLegalLocale,
    })
    await ElMessageBox.alert(app.t('auth.registrationSuccess'), app.t('common.register'), {
      confirmButtonText: app.t('common.confirm'),
      type: 'success',
      showClose: false,
      closeOnClickModal: false,
      closeOnPressEscape: false,
    })
    router.push({ path: '/login', query: { account: form.userName, registeredUserId: String(result.userId) } })
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
.captcha-row { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 120px 40px; gap: 8px; align-items: center; }
.captcha-image-button { width: 120px !important; height: 40px; padding: 0; overflow: hidden; display: grid; place-items: center; border: 1px solid var(--el-border-color); border-radius: var(--radius-sm); background: #fff; color: var(--color-primary); cursor: pointer; }
.captcha-image-button:disabled { cursor: wait; }
.captcha-image-button img { display: block; width: 100%; height: 100%; object-fit: contain; }
.captcha-refresh { width: 40px !important; height: 40px; }
.legal-loading { min-height: 40px; display: flex; align-items: center; gap: 8px; color: var(--color-text-muted); font-size: 14px; }
.legal-retry { width: auto !important; margin-top: 6px; padding: 0; }
.legal-consents { display: grid; gap: 8px; min-width: 0; }
.legal-consents :deep(.el-checkbox) { height: auto; align-items: flex-start; white-space: normal; }
.legal-consents :deep(.el-checkbox__input) { margin-top: 3px; }
.legal-consents :deep(.el-checkbox__label) { min-width: 0; white-space: normal; line-height: 1.5; }
.legal-consents a { font-weight: 600; }
.user-name-field :deep(.el-form-item__error) { position: static; width: 100%; padding-top: 6px; line-height: 1.4; }
.el-button[type='button'], .auth-form > .el-button { width: 100%; }
a { color: var(--color-primary); font-weight: 700; text-align: center; }
@media (max-width: 420px) { .captcha-row { grid-template-columns: minmax(0, 1fr) 104px 40px; } .captcha-image-button { width: 104px !important; } }
</style>
