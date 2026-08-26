<template>
  <div class="generator-page">
    <section class="generator-panel page-card">
      <div class="panel-heading">
        <div>
          <h2>{{ app.t('codeGenerator.formTitle') }}</h2>
          <p>{{ app.t('codeGenerator.formDescription') }}</p>
        </div>
        <div class="batch-total" aria-live="polite">
          <span>{{ batchMetricLabel }}</span>
          <strong>{{ batchMetricValue }}</strong>
        </div>
      </div>

      <el-form class="generator-form" label-position="top" :disabled="generating">
        <el-form-item class="mode-field" :label="app.t('codeGenerator.issueMode')">
          <el-segmented v-model="mode" :options="modeOptions" />
        </el-form-item>

        <template v-if="mode === 'package'">
          <el-form-item class="package-field" :label="app.t('codeGenerator.package')">
            <el-select
              v-model="form.packageCode"
              :loading="packagesLoading"
              :disabled="packagesLoading || !packages.length"
              :placeholder="app.t('codeGenerator.packagePlaceholder')"
            >
              <el-option
                v-for="pointPackage in packages"
                :key="pointPackage.code"
                :label="pointPackage.name"
                :value="pointPackage.code"
              >
                <span class="package-option-name">{{ pointPackage.name }}</span>
                <code>{{ pointPackage.code }}</code>
              </el-option>
            </el-select>
          </el-form-item>

          <el-form-item class="order-field" :label="app.t('codeGenerator.orderNo')">
            <el-input
              v-model="form.orderNo"
              clearable
              :placeholder="app.t('codeGenerator.orderNoPlaceholder')"
              @blur="normalizeOrderNo"
            />
          </el-form-item>
        </template>

        <el-form-item v-else class="points-field" :label="app.t('codeGenerator.points')">
          <el-input-number
            v-model="form.points"
            :min="1"
            :max="MAX_POINTS"
            :step="100"
            :precision="0"
            controls-position="right"
            :placeholder="app.t('codeGenerator.pointsPlaceholder')"
          />
        </el-form-item>

        <el-form-item class="count-field" :label="app.t('codeGenerator.count')">
          <el-input-number
            v-model="form.count"
            :min="1"
            :max="MAX_COUNT"
            :step="1"
            :precision="0"
            controls-position="right"
            :disabled="hasOrderNo"
            :placeholder="app.t('codeGenerator.countPlaceholder')"
          />
          <p v-if="hasOrderNo" class="field-hint">{{ app.t('codeGenerator.orderNoCountHint') }}</p>
        </el-form-item>

        <el-form-item class="expiry-field" :label="app.t('codeGenerator.redemptionDeadline')">
          <el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            :placeholder="app.t('codeGenerator.redemptionDeadlinePlaceholder')"
            :disabled-date="disablePastDate"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            clearable
          />
          <p class="field-hint">{{ app.t('codeGenerator.redemptionDeadlineHint') }}</p>
        </el-form-item>

        <div v-if="mode === 'package' && selectedPackage" class="package-preview">
          <span>{{ app.t('codeGenerator.packagePreview') }}</span>
          <strong>{{ selectedPackage.name }}</strong>
          <p>{{ selectedPointRule }}</p>
          <p v-if="hasOrderNo" class="order-warning">{{ app.t('codeGenerator.orderNoConfirmationHint') }}</p>
        </div>

        <el-alert
          v-if="packagesError && mode === 'package'"
          class="form-alert"
          type="error"
          :closable="false"
          :title="app.t('codeGenerator.packageLoadFailed')"
          show-icon
        >
          <template #default>
            <el-button size="small" :loading="packagesLoading" @click="loadPackages">
              <el-icon><Refresh /></el-icon>
              <span>{{ app.t('codeGenerator.retryPackages') }}</span>
            </el-button>
          </template>
        </el-alert>

        <el-alert
          v-if="submissionState !== 'idle'"
          class="form-alert"
          type="warning"
          :closable="false"
          :title="submissionNotice"
          show-icon
        />

        <el-button
          class="generate-button"
          type="primary"
          native-type="button"
          :loading="generating"
          :disabled="submitDisabled"
          @click="generateCodes"
        >
          <el-icon><Key /></el-icon>
          <span>{{ submitButtonLabel }}</span>
        </el-button>
      </el-form>

      <div class="security-note">
        <el-icon><Lock /></el-icon>
        <div>
          <strong>{{ app.t('codeGenerator.securityTitle') }}</strong>
          <p>{{ app.t('codeGenerator.securityDescription') }}</p>
        </div>
      </div>
    </section>

    <el-dialog
      :model-value="Boolean(result)"
      class="issued-result-dialog"
      width="min(760px, calc(100vw - 32px))"
      append-to-body
      destroy-on-close
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :lock-scroll="true"
      :title="app.t('codeGenerator.resultTitle')"
    >
      <template v-if="result">
        <el-alert
          class="result-warning"
          type="warning"
          :closable="false"
          :title="app.t('codeGenerator.resultSecurityWarning')"
          show-icon
        />

        <dl class="result-summary">
          <div>
            <dt>{{ app.t('codeGenerator.resultPackage') }}</dt>
            <dd>{{ resultPackageLabel }}</dd>
          </div>
          <div>
            <dt>{{ app.t('codeGenerator.resultPointRule') }}</dt>
            <dd>{{ resultPointRule }}</dd>
          </div>
          <div>
            <dt>{{ app.t('codeGenerator.resultCount') }}</dt>
            <dd>{{ formatNumber(result.codes.length) }}</dd>
          </div>
          <div>
            <dt>{{ app.t('codeGenerator.redemptionDeadline') }}</dt>
            <dd>{{ result.expiresAt ? formatDateTime(result.expiresAt) : app.t('codeGenerator.noRedemptionDeadline') }}</dd>
          </div>
        </dl>

        <div class="result-actions">
          <el-button @click="copyAllCodes">
            <el-icon><CopyDocument /></el-icon>
            <span>{{ app.t('codeGenerator.copyAll') }}</span>
          </el-button>
          <el-button type="primary" plain @click="exportTxt">
            <el-icon><Download /></el-icon>
            <span>{{ app.t('codeGenerator.exportTxt') }}</span>
          </el-button>
        </div>

        <div class="code-list">
          <div v-for="(code, index) in result.codes" :key="index" class="code-row">
            <span class="code-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <code>{{ code }}</code>
            <el-tooltip :content="app.t('codeGenerator.copy')">
              <el-button circle :aria-label="app.t('codeGenerator.copy')" @click="copyCode(code)">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </div>
      </template>

      <template #footer>
        <el-button class="saved-button" type="primary" @click="acknowledgeSaved">
          <el-icon><CircleCheck /></el-icon>
          <span>{{ app.t('codeGenerator.savedAcknowledge') }}</span>
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CircleCheck, CopyDocument, Download, Key, Lock, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onBeforeRouteLeave } from 'vue-router'
import { getRechargePackages, issuePointCodes } from '@/services/credits'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { ApiError } from '@/types/api'
import type { IssuePointCodesRequest, PointPackageCode, RechargePackage } from '@/types/credits'

const MAX_POINTS = 1_000_000
const MAX_COUNT = 100
const DEFAULT_RETRY_SECONDS = 60
const ADMIN_PACKAGE_CODES = new Set<PointPackageCode>(['monthly', 'trial', 'basic', 'value'])

type IssueMode = 'package' | 'custom'
type SubmissionState = 'idle' | 'rate-limited' | 'unknown' | 'blocked' | 'unavailable'

interface GeneratedBatch {
  mode: IssueMode
  packageCode?: PointPackageCode
  packageName?: string
  points: number
  expiresAt?: string
  codes: string[]
}

const app = useAppStore()
const auth = useAuthStore()
const mode = ref<IssueMode>('package')
const form = reactive<{
  packageCode: PointPackageCode | ''
  points: number
  count: number
  orderNo: string
  expiresAt: string | null
}>({
  packageCode: '',
  points: 100,
  count: 10,
  orderNo: '',
  expiresAt: null,
})
const packages = ref<RechargePackage[]>([])
const packagesLoading = ref(false)
const packagesError = ref(false)
const generating = ref(false)
const result = ref<GeneratedBatch | null>(null)
const retrySeconds = ref(0)
const submissionState = ref<SubmissionState>('idle')
const submissionRequestId = ref<string>()
let retryTimer: number | undefined

const modeOptions = computed(() => [
  { label: app.t('codeGenerator.packageMode'), value: 'package' },
  { label: app.t('codeGenerator.customMode'), value: 'custom' },
])
const selectedPackage = computed(() => packages.value.find((item) => item.code === form.packageCode))
const hasOrderNo = computed(() => mode.value === 'package' && Boolean(form.orderNo.trim()))
const selectedPointRule = computed(() => selectedPackage.value
  ? pointRule(selectedPackage.value.code, selectedPackage.value.points)
  : '')
const batchMetricLabel = computed(() => mode.value === 'package' && selectedPackage.value?.code === 'trial'
  ? app.t('codeGenerator.singleCodeRule')
  : app.t('codeGenerator.totalPoints'))
const batchMetricValue = computed(() => {
  if (mode.value === 'custom') return formatNumber(safeInteger(form.points) * safeInteger(form.count))
  if (packagesLoading.value) return app.t('common.loading')
  const pointPackage = selectedPackage.value
  if (!pointPackage) return app.t('codeGenerator.packageUnavailable')
  if (pointPackage.code === 'trial') return app.t('codeGenerator.trialPointShort')
  const points = pointPackage.code === 'monthly' ? 5000 : pointPackage.points
  return formatNumber(safeInteger(points) * safeInteger(form.count))
})
const submissionNotice = computed(() => {
  let message = ''
  if (submissionState.value === 'unknown') message = app.t('codeGenerator.issueOutcomeUnknown')
  if (submissionState.value === 'blocked') message = app.t('codeGenerator.issueBlocked')
  if (submissionState.value === 'unavailable') message = app.t('codeGenerator.issueServiceUnavailable')
  if (submissionState.value === 'rate-limited') {
    message = translate('codeGenerator.rateLimitedCountdown', { seconds: retrySeconds.value })
  }
  return withRequestId(message, submissionRequestId.value)
})
const submitDisabled = computed(() => generating.value
  || ['rate-limited', 'unknown', 'blocked'].includes(submissionState.value)
  || (mode.value === 'package' && (packagesLoading.value || !selectedPackage.value)))
const submitButtonLabel = computed(() => {
  if (generating.value) return app.t('codeGenerator.generating')
  if (submissionState.value === 'rate-limited') {
    return translate('codeGenerator.rateLimitedButton', { seconds: retrySeconds.value })
  }
  if (submissionState.value === 'unknown') return app.t('codeGenerator.issueOutcomeUnknownButton')
  if (submissionState.value === 'blocked') return app.t('codeGenerator.issueBlockedButton')
  return app.t('codeGenerator.generate')
})
const resultPackageLabel = computed(() => {
  if (!result.value) return ''
  if (result.value.mode === 'custom') return app.t('codeGenerator.customMode')
  return result.value.packageName
    ? `${result.value.packageName} (${result.value.packageCode})`
    : String(result.value.packageCode || '')
})
const resultPointRule = computed(() => result.value
  ? pointRule(result.value.packageCode, result.value.points)
  : '')

watch(mode, (nextMode) => {
  if (nextMode === 'custom') form.orderNo = ''
})

watch(() => form.orderNo, () => {
  if (hasOrderNo.value) form.count = 1
})

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  void loadPackages()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  stopRetryTimer()
  clearResult()
})

onBeforeRouteLeave(() => {
  if (!auth.isAuthenticated) return true
  if (!result.value) return true
  ElMessage.warning(app.t('codeGenerator.leaveBlocked'))
  return false
})

async function loadPackages() {
  if (packagesLoading.value) return
  packagesLoading.value = true
  packagesError.value = false
  try {
    const response = await getRechargePackages('web')
    const availablePackages = response
      .filter((item): item is RechargePackage & { code: PointPackageCode } => isAdminPackageCode(item.code))
      .slice()
      .sort((left, right) => left.sort - right.sort)
    packages.value = availablePackages
    if (!availablePackages.some((item) => item.code === form.packageCode)) {
      form.packageCode = availablePackages[0]?.code || ''
    }
    packagesError.value = availablePackages.length === 0
  } catch {
    packages.value = []
    form.packageCode = ''
    packagesError.value = true
  } finally {
    packagesLoading.value = false
  }
}

async function generateCodes() {
  if (submitDisabled.value || !validateForm()) return

  generating.value = true
  submissionState.value = 'idle'
  submissionRequestId.value = undefined
  const submittedMode = mode.value
  const submittedPackageCode = submittedMode === 'package' ? form.packageCode as PointPackageCode : undefined
  const submittedExpiresAt = form.expiresAt || undefined
  const packageSnapshot = selectedPackage.value
  try {
    const payload: IssuePointCodesRequest = submittedMode === 'package'
      ? {
          packageCode: submittedPackageCode!,
          count: hasOrderNo.value ? 1 : form.count,
          ...(form.orderNo.trim() ? { orderNo: form.orderNo.trim() } : {}),
          ...(submittedExpiresAt ? { expiresAt: submittedExpiresAt } : {}),
        }
      : {
          points: form.points,
          count: form.count,
          ...(submittedExpiresAt ? { expiresAt: submittedExpiresAt } : {}),
        }
    const response = await issuePointCodes(payload)
    if (!Array.isArray(response.codes) || response.codes.length === 0) {
      throw new Error('Issue response did not include codes')
    }
    result.value = {
      mode: submittedMode,
      packageCode: submittedPackageCode,
      packageName: submittedMode === 'package' ? packageSnapshot?.name : undefined,
      points: response.points,
      expiresAt: submittedExpiresAt,
      codes: response.codes,
    }
    ElMessage.success(app.t('codeGenerator.generated'))
  } catch (error) {
    handleIssueError(error)
  } finally {
    generating.value = false
  }
}

function validateForm() {
  if (mode.value === 'package' && !selectedPackage.value) {
    ElMessage.warning(app.t('codeGenerator.packageRequired'))
    return false
  }
  if (mode.value === 'custom' && (!Number.isInteger(form.points) || form.points < 1 || form.points > MAX_POINTS)) {
    ElMessage.warning(app.t('codeGenerator.pointsRequired'))
    return false
  }
  if (!Number.isInteger(form.count) || form.count < 1 || form.count > MAX_COUNT) {
    ElMessage.warning(app.t('codeGenerator.countRequired'))
    return false
  }
  if (form.expiresAt && new Date(form.expiresAt).getTime() <= Date.now()) {
    ElMessage.warning(app.t('codeGenerator.expiryInvalid'))
    return false
  }
  return true
}

function handleIssueError(error: unknown) {
  const apiError = error as Partial<ApiError>
  const status = apiError.status
  const machineCode = String(apiError.code).toUpperCase()
  submissionRequestId.value = apiError.requestId
  if (status === 429 || machineCode === 'RATE_LIMITED') {
    startRetryCountdown(readRetryAfterSeconds(apiError))
    return
  }
  if (status == null || [408, 502, 504].includes(status) || ['REQUEST_TIMEOUT', 'GATEWAY_TIMEOUT'].includes(machineCode)) {
    submissionState.value = 'unknown'
    return
  }
  if (status === 403 || status === 409 || ['RESOURCE_FORBIDDEN', 'IDEMPOTENCY_CONFLICT'].includes(machineCode)) {
    submissionState.value = 'blocked'
    return
  }
  if ([500, 503].includes(status) || ['SERVER_ERROR', 'SERVICE_UNAVAILABLE'].includes(machineCode)) {
    submissionState.value = 'unavailable'
    return
  }
  ElMessage.error(withRequestId(app.t('codeGenerator.generateFailed'), apiError.requestId))
}

function readRetryAfterSeconds(error: Partial<ApiError>) {
  if (Number.isFinite(error.retryAfterSeconds) && Number(error.retryAfterSeconds) >= 0) {
    return Math.max(1, Math.ceil(Number(error.retryAfterSeconds)))
  }
  if (error.details && typeof error.details === 'object') {
    const details = error.details as Record<string, unknown>
    const seconds = Number(details.retryAfterSeconds ?? details.RetryAfterSeconds)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds))
  }
  return DEFAULT_RETRY_SECONDS
}

function startRetryCountdown(seconds: number) {
  stopRetryTimer()
  submissionState.value = 'rate-limited'
  retrySeconds.value = Math.max(1, seconds)
  retryTimer = window.setInterval(() => {
    retrySeconds.value = Math.max(0, retrySeconds.value - 1)
    if (retrySeconds.value === 0) {
      stopRetryTimer()
      submissionState.value = 'idle'
      submissionRequestId.value = undefined
    }
  }, 1000)
}

function stopRetryTimer() {
  if (retryTimer !== undefined) window.clearInterval(retryTimer)
  retryTimer = undefined
}

function normalizeOrderNo() {
  form.orderNo = form.orderNo.trim()
}

function disablePastDate(date: Date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date.getTime() < today.getTime()
}

async function copyCode(code: string) {
  try {
    await writeClipboard(code)
    ElMessage.success(app.t('codeGenerator.copied'))
  } catch {
    ElMessage.error(app.t('codeGenerator.copyFailed'))
  }
}

async function copyAllCodes() {
  if (!result.value) return
  try {
    await writeClipboard(result.value.codes.join('\n'))
    ElMessage.success(app.t('codeGenerator.copiedAll'))
  } catch {
    ElMessage.error(app.t('codeGenerator.copyFailed'))
  }
}

function exportTxt() {
  if (!result.value) return
  const summary = [
    `${app.t('codeGenerator.resultPackage')}: ${resultPackageLabel.value}`,
    `${app.t('codeGenerator.resultPointRule')}: ${resultPointRule.value}`,
    `${app.t('codeGenerator.resultCount')}: ${formatNumber(result.value.codes.length)}`,
    `${app.t('codeGenerator.redemptionDeadline')}: ${result.value.expiresAt ? formatDateTime(result.value.expiresAt) : app.t('codeGenerator.noRedemptionDeadline')}`,
    '',
    app.t('codeGenerator.code'),
    ...result.value.codes,
  ]
  const url = URL.createObjectURL(new Blob([`\uFEFF${summary.join('\r\n')}`], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `redeem-codes-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}

function acknowledgeSaved() {
  clearResult()
}

function clearResult() {
  const batch = result.value
  if (!batch) return
  batch.codes.fill('')
  result.value = null
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!result.value) return
  event.preventDefault()
  event.returnValue = ''
}

function pointRule(packageCode: PointPackageCode | undefined, points: number) {
  if (packageCode === 'monthly') return app.t('codeGenerator.monthlyPointRule')
  if (packageCode === 'trial') return app.t('codeGenerator.trialPointRule')
  return translate('codeGenerator.permanentPointRule', { points: formatNumber(points) })
}

function isAdminPackageCode(code: string): code is PointPackageCode {
  return ADMIN_PACKAGE_CODES.has(code as PointPackageCode)
}

function safeInteger(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 0
}

function withRequestId(message: string, requestId?: string) {
  return requestId
    ? `${message} ${translate('codeGenerator.requestId', { requestId })}`
    : message
}

function translate(key: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.split(`{${name}}`).join(String(value)),
    app.t(key),
  )
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Clipboard access can be blocked outside secure browser contexts.
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  let copied = false
  try {
    textarea.select()
    copied = document.execCommand('copy')
  } finally {
    textarea.value = ''
    textarea.remove()
  }
  if (!copied) throw new Error('Copy failed')
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(app.locale === 'zh-CN' ? 'zh-CN' : 'en-US').format(value)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(app.locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
</script>

<style scoped>
.generator-page { display: grid; gap: 24px; }
.generator-panel { padding: 28px; }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
p { margin: 8px 0 0; color: var(--color-text-muted); line-height: 1.55; }
.batch-total { min-width: 210px; padding-left: 24px; border-left: 1px solid var(--color-border); text-align: right; }
.batch-total span { display: block; color: var(--color-text-muted); font-size: 13px; font-weight: 700; }
.batch-total strong { display: block; margin-top: 6px; font-size: 24px; font-variant-numeric: tabular-nums; }
.generator-form { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)) minmax(240px, 1.25fr); align-items: start; gap: 18px 16px; margin-top: 28px; }
.generator-form :deep(.el-form-item) { margin-bottom: 0; }
.generator-form :deep(.el-input-number), .generator-form :deep(.el-date-editor), .generator-form :deep(.el-select), .generator-form :deep(.el-segmented) { width: 100%; }
.generator-form :deep(.el-input-number .el-input__wrapper), .generator-form :deep(.el-date-editor .el-input__wrapper), .generator-form :deep(.el-select__wrapper), .generator-form :deep(.el-input__wrapper) { min-height: 44px; }
.count-field :deep(.el-form-item__content), .expiry-field :deep(.el-form-item__content) { flex-direction: column; align-items: stretch; }
.mode-field, .package-preview, .form-alert, .generate-button { grid-column: 1 / -1; }
.mode-field :deep(.el-segmented__item) { min-height: 38px; }
.package-option-name { margin-right: 10px; }
.package-field code { color: var(--color-text-muted); font-size: 12px; }
.field-hint { margin-top: 5px; font-size: 12px; }
.package-preview { min-width: 0; padding: 2px 0 2px 14px; border-left: 3px solid var(--color-primary); }
.package-preview > span { display: block; color: var(--color-text-muted); font-size: 12px; font-weight: 700; }
.package-preview strong { display: block; margin-top: 4px; font-size: 15px; }
.package-preview p { margin-top: 3px; font-size: 13px; }
.package-preview .order-warning { color: #8a5a00; font-weight: 600; }
.form-alert :deep(.el-alert__content) { min-width: 0; }
.form-alert :deep(.el-alert__description) { margin-top: 10px; }
.generate-button { width: 100%; min-height: 44px; margin-left: 0; }
.security-note { display: flex; align-items: flex-start; gap: 12px; margin-top: 24px; padding: 16px; border: 1px solid #d6b86d; border-radius: var(--radius-sm); background: #fff8df; color: #5f4a16; }
.security-note > .el-icon { flex: 0 0 auto; margin-top: 2px; font-size: 18px; }
.security-note p { margin-top: 3px; color: #765f27; font-size: 13px; }
.result-warning { margin-bottom: 18px; }
.result-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-border); }
.result-summary > div { min-width: 0; padding: 12px 14px; background: var(--color-surface); }
.result-summary dt { color: var(--color-text-muted); font-size: 12px; font-weight: 700; }
.result-summary dd { margin: 5px 0 0; overflow-wrap: anywhere; color: var(--color-text); font-size: 14px; line-height: 1.45; }
.result-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.result-actions .el-button { margin-left: 0; }
.code-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; max-height: min(42vh, 420px); margin-top: 18px; overflow-y: auto; }
.code-row { min-width: 0; min-height: 52px; display: grid; grid-template-columns: 34px minmax(0, 1fr) 34px; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); }
.code-index { color: var(--color-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.code-row code { min-width: 0; overflow-wrap: anywhere; color: var(--color-text); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 13px; line-height: 1.45; white-space: normal; }
.saved-button { min-width: 190px; min-height: 42px; }
:global(.issued-result-dialog .el-dialog__body) { padding-top: 10px; }
:global(html.dark) .security-note { border-color: #705d2a; background: #302a18; color: #f0d98c; }
:global(html.dark) .security-note p { color: #d3bc72; }
:global(html.dark) .package-preview .order-warning { color: #e5bd68; }
@media (max-width: 920px) { .generator-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 720px) { .generator-panel { padding: 20px; } .panel-heading { flex-direction: column; } .batch-total { width: 100%; padding: 14px 0 0; border-top: 1px solid var(--color-border); border-left: 0; text-align: left; } .generator-form, .result-summary, .code-list { grid-template-columns: 1fr; } .result-actions { justify-content: stretch; } .result-actions .el-button { flex: 1 1 0; min-width: 0; } }
@media (max-width: 420px) { .result-actions { flex-direction: column; } .result-actions .el-button { width: 100%; white-space: normal; } .saved-button { width: 100%; min-width: 0; white-space: normal; } }
</style>
