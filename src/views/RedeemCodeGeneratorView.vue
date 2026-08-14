<template>
  <div class="generator-page">
    <section class="generator-panel page-card">
      <div class="panel-heading">
        <div>
          <h2>{{ app.t('codeGenerator.formTitle') }}</h2>
          <p>{{ app.t('codeGenerator.formDescription') }}</p>
        </div>
        <div class="batch-total" aria-live="polite">
          <span>{{ app.t('codeGenerator.totalPoints') }}</span>
          <strong>{{ formatNumber(batchTotal) }}</strong>
        </div>
      </div>

      <el-form class="generator-form" label-position="top" @keyup.enter="generateCodes">
        <el-form-item :label="app.t('codeGenerator.points')">
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
        <el-form-item :label="app.t('codeGenerator.count')">
          <el-input-number
            v-model="form.count"
            :min="1"
            :max="MAX_COUNT"
            :step="1"
            :precision="0"
            controls-position="right"
            :placeholder="app.t('codeGenerator.countPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="app.t('codeGenerator.expiry')">
          <el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            :placeholder="app.t('codeGenerator.expiryPlaceholder')"
            :disabled-date="disablePastDate"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            clearable
          />
        </el-form-item>
        <el-button class="generate-button" type="primary" native-type="button" :loading="generating" @click="generateCodes">
          <el-icon><Key /></el-icon>
          <span>{{ generating ? app.t('codeGenerator.generating') : app.t('codeGenerator.generate') }}</span>
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

    <section v-if="result" class="result-panel page-card" aria-live="polite">
      <div class="result-heading">
        <div>
          <span class="result-kicker">{{ app.t('codeGenerator.resultTitle') }}</span>
          <h2>{{ resultSummary }}</h2>
          <p>{{ result.expiresAt ? formatDateTime(result.expiresAt) : app.t('codeGenerator.permanent') }}</p>
        </div>
        <div class="result-actions">
          <el-tooltip :content="app.t('codeGenerator.copyAll')">
            <el-button :aria-label="app.t('codeGenerator.copyAll')" @click="copyAllCodes">
              <el-icon><CopyDocument /></el-icon>
              <span>{{ app.t('codeGenerator.copyAll') }}</span>
            </el-button>
          </el-tooltip>
          <el-button type="primary" @click="exportCsv">
            <el-icon><Download /></el-icon>
            <span>{{ app.t('codeGenerator.exportCsv') }}</span>
          </el-button>
        </div>
      </div>

      <div class="code-list">
        <div v-for="(code, index) in result.codes" :key="code" class="code-row">
          <span class="code-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <code>{{ code }}</code>
          <el-tooltip :content="app.t('codeGenerator.copy')">
            <el-button circle :aria-label="app.t('codeGenerator.copy')" @click="copyCode(code)">
              <el-icon><CopyDocument /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { CopyDocument, Download, Key, Lock } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeRouteLeave } from 'vue-router'
import { issuePointCodes } from '@/services/credits'
import { useAppStore } from '@/stores/app'
import type { ApiError } from '@/types/api'

const MAX_POINTS = 1_000_000
const MAX_COUNT = 100

interface GeneratedBatch {
  points: number
  expiresAt?: string
  codes: string[]
}

const app = useAppStore()
const form = reactive<{ points: number; count: number; expiresAt: string | null }>({
  points: 100,
  count: 10,
  expiresAt: null,
})
const generating = ref(false)
const result = ref<GeneratedBatch | null>(null)
const resultSaved = ref(false)
const batchTotal = computed(() => Math.max(0, Number(form.points) || 0) * Math.max(0, Number(form.count) || 0))
const resultSummary = computed(() => {
  if (!result.value) return ''
  return app.t('codeGenerator.resultSummary')
    .replace('{count}', formatNumber(result.value.codes.length))
    .replace('{points}', formatNumber(result.value.points))
})

onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  result.value = null
})

onBeforeRouteLeave(async () => {
  if (!result.value || resultSaved.value) return true
  try {
    await confirmLeaveResult()
    return true
  } catch {
    return false
  }
})

async function generateCodes() {
  if (generating.value || !validateForm()) return
  if (result.value && !resultSaved.value) {
    try {
      await confirmDiscardResult()
    } catch {
      return
    }
  }

  generating.value = true
  try {
    const payload = {
      points: form.points,
      count: form.count,
      ...(form.expiresAt ? { expiresAt: form.expiresAt } : {}),
    }
    const response = await issuePointCodes(payload)
    result.value = { points: response.points, expiresAt: form.expiresAt || undefined, codes: response.codes }
    resultSaved.value = false
    ElMessage.success(app.t('codeGenerator.generated'))
  } catch (error) {
    ElMessage.error((error as ApiError).message || app.t('codeGenerator.generateFailed'))
  } finally {
    generating.value = false
  }
}

function validateForm() {
  if (!Number.isInteger(form.points) || form.points < 1 || form.points > MAX_POINTS) {
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
    resultSaved.value = true
    ElMessage.success(app.t('codeGenerator.copiedAll'))
  } catch {
    ElMessage.error(app.t('codeGenerator.copyFailed'))
  }
}

function exportCsv() {
  if (!result.value) return
  const rows = [
    ['code', 'points', 'expires_at'],
    ...result.value.codes.map((code) => [code, String(result.value!.points), result.value!.expiresAt || '']),
  ]
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `redeem-codes-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  resultSaved.value = true
}

function confirmDiscardResult() {
  return ElMessageBox.confirm(
    app.t('codeGenerator.replaceMessage'),
    app.t('codeGenerator.replaceTitle'),
    { confirmButtonText: app.t('codeGenerator.replaceConfirm'), cancelButtonText: app.t('common.cancel'), type: 'warning' },
  )
}

function confirmLeaveResult() {
  return ElMessageBox.confirm(
    app.t('codeGenerator.leaveMessage'),
    app.t('codeGenerator.leaveTitle'),
    { confirmButtonText: app.t('codeGenerator.leaveConfirm'), cancelButtonText: app.t('common.cancel'), type: 'warning' },
  )
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!result.value || resultSaved.value) return
  event.preventDefault()
  event.returnValue = ''
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Some browsers expose Clipboard API but block it outside secure contexts.
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
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
.generator-panel, .result-panel { padding: 28px; }
.panel-heading, .result-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
p { margin: 8px 0 0; color: var(--color-text-muted); line-height: 1.55; }
.batch-total { min-width: 180px; padding-left: 24px; border-left: 1px solid var(--color-border); text-align: right; }
.batch-total span { display: block; color: var(--color-text-muted); font-size: 13px; font-weight: 700; }
.batch-total strong { display: block; margin-top: 6px; font-size: 30px; font-variant-numeric: tabular-nums; }
.generator-form { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) minmax(240px, 1.3fr) auto; align-items: end; gap: 16px; margin-top: 28px; }
.generator-form :deep(.el-form-item) { margin-bottom: 0; }
.generator-form :deep(.el-input-number), .generator-form :deep(.el-date-editor) { width: 100%; }
.generator-form :deep(.el-input-number .el-input__wrapper), .generator-form :deep(.el-date-editor .el-input__wrapper) { min-height: 44px; }
.generate-button { min-width: 150px; min-height: 44px; }
.security-note { display: flex; align-items: flex-start; gap: 12px; margin-top: 24px; padding: 16px; border: 1px solid #d6b86d; border-radius: var(--radius-sm); background: #fff8df; color: #5f4a16; }
.security-note > .el-icon { flex: 0 0 auto; margin-top: 2px; font-size: 18px; }
.security-note p { margin-top: 3px; color: #765f27; font-size: 13px; }
.result-panel { min-width: 0; }
.result-heading { padding-bottom: 22px; border-bottom: 1px solid var(--color-border); }
.result-kicker { display: block; margin-bottom: 7px; color: var(--color-primary); font-size: 12px; font-weight: 800; text-transform: uppercase; }
.result-heading h2 { font-size: 18px; }
.result-heading p { font-size: 13px; }
.result-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
.code-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 22px; }
.code-row { min-width: 0; min-height: 52px; display: grid; grid-template-columns: 34px minmax(0, 1fr) 34px; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); }
.code-index { color: var(--color-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.code-row code { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--color-text); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 13px; white-space: nowrap; }
:global(html.dark) .security-note { border-color: #705d2a; background: #302a18; color: #f0d98c; }
:global(html.dark) .security-note p { color: #d3bc72; }
@media (max-width: 1100px) { .generator-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .generate-button { width: 100%; } }
@media (max-width: 720px) { .generator-panel, .result-panel { padding: 20px; } .panel-heading, .result-heading { flex-direction: column; } .batch-total { width: 100%; padding: 14px 0 0; border-top: 1px solid var(--color-border); border-left: 0; text-align: left; } .generator-form, .code-list { grid-template-columns: 1fr; } .result-actions { width: 100%; justify-content: flex-start; } }
@media (max-width: 420px) { .result-actions .el-button { flex: 1 1 0; min-width: 0; margin-left: 0; } .result-actions .el-button span { white-space: normal; } }
</style>
