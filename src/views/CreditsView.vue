<template>
  <div class="credits-page">
    <section v-loading="summaryRefreshing" class="balance-card page-card">
      <div v-if="summaryLoadFailed && !credits.summaryLoaded" class="balance-load-error" role="alert">
        <el-icon aria-hidden="true"><WarningFilled /></el-icon>
        <strong>{{ app.t('credits.summaryLoadFailed') }}</strong>
        <el-button type="primary" plain @click="refreshCredits">{{ app.t('common.retry') }}</el-button>
      </div>

      <template v-else>
        <el-alert
          v-if="summaryLoadFailed"
          class="cached-data-warning"
          :title="app.t('credits.summaryRefreshFailed')"
          type="warning"
          :closable="false"
          show-icon
        />
        <div class="balance-overview">
        <span class="section-label">{{ app.t('credits.availablePoints') }}</span>
        <strong class="balance-total" aria-live="polite">{{ formatPoints(credits.summary.balance) }}</strong>

        <dl class="balance-breakdown">
          <div>
            <dt>{{ app.t('credits.permanentPoints') }}</dt>
            <dd>{{ formatPoints(credits.summary.permanentPoints) }}</dd>
          </div>
          <div>
            <dt>{{ app.t('credits.expiringPoints') }}</dt>
            <dd>{{ formatPoints(credits.summary.expiringPoints) }}</dd>
          </div>
        </dl>
        </div>

        <div class="balance-side">
        <div class="expiry-summary" :class="{ 'expiry-summary--empty': !credits.summary.nextExpireAt }">
          <span>{{ app.t('credits.nextExpiry') }}</span>
          <template v-if="credits.summary.nextExpireAt">
            <strong>{{ formatPoints(credits.summary.nextExpiringPoints) }} {{ app.t('credits.pointsUnit') }}</strong>
            <time :datetime="credits.summary.nextExpireAt">
              {{ app.t('credits.expiresAt') }} {{ formatLocalDate(credits.summary.nextExpireAt) }}
            </time>
          </template>
          <strong v-else>{{ app.t('credits.noExpiringPoints') }}</strong>
        </div>

        <div class="balance-actions">
          <el-button
            type="primary"
            class="soft-button"
            :loading="credits.signingIn"
            :disabled="credits.summary.checkedInToday"
            @click="checkIn"
          >
            <el-icon><Calendar /></el-icon>
            {{ credits.summary.checkedInToday ? app.t('credits.checkedInToday') : app.t('credits.checkIn') }}
          </el-button>
          <el-button class="soft-button" @click="router.push({ name: 'recharge' })">
            <el-icon><Coin /></el-icon>
            {{ app.t('pricing.getMoreCredits') }}
          </el-button>
        </div>

        <p class="check-in-status">
          <template v-if="credits.summary.checkedInToday">
            {{ app.t('credits.todaySignInPoints') }}
            <strong>{{ formatPoints(credits.summary.todaySignInPoints) }}</strong>
            {{ app.t('credits.pointsUnit') }}
          </template>
          <template v-else>{{ app.t('credits.checkInHint') }}</template>
        </p>
        </div>
      </template>
    </section>

    <section class="deduction-rule page-card">
      <el-icon aria-hidden="true"><InfoFilled /></el-icon>
      <div>
        <h2>{{ app.t('credits.deductionRuleTitle') }}</h2>
        <p>{{ app.t('credits.deductionRule') }}</p>
      </div>
    </section>

    <section class="page-card table-card">
      <header class="table-header">
        <h2>{{ app.t('credits.recordsTitle') }}</h2>
      </header>
      <el-alert
        v-if="recordsLoadFailed && credits.records.length"
        class="records-refresh-warning"
        :title="app.t('credits.recordsRefreshFailed')"
        type="warning"
        :closable="false"
        show-icon
      />
      <div v-if="recordsLoadFailed && !credits.records.length" class="records-load-error" role="alert">
        <span>{{ app.t('credits.recordsLoadFailed') }}</span>
        <el-button type="primary" link @click="refreshCredits">{{ app.t('common.retry') }}</el-button>
      </div>
      <div v-else v-loading="credits.loading" class="table-scroll">
        <el-table :data="credits.records">
          <el-table-column :label="app.t('credits.type')" min-width="140">
            <template #default="{ row }">{{ formatRecordType(row) }}</template>
          </el-table-column>
          <el-table-column :label="app.t('credits.amount')" min-width="100" align="right">
            <template #default="{ row }">
              <strong :class="amountClass(row.amount)">{{ formatAmount(row.amount) }}</strong>
            </template>
          </el-table-column>
          <el-table-column prop="description" :label="app.t('credits.description')" min-width="220" />
          <el-table-column :label="app.t('credits.date')" min-width="180">
            <template #default="{ row }">
              <time :datetime="row.date">{{ formatLocalDate(row.date) }}</time>
            </template>
          </el-table-column>
          <el-table-column :label="app.t('credits.balance')" min-width="100" align="right">
            <template #default="{ row }">{{ formatPoints(row.balance) }}</template>
          </el-table-column>
        </el-table>
      </div>
      <div v-if="credits.total > pageSize" class="table-pagination">
        <el-pagination
          layout="prev, pager, next"
          :total="credits.total"
          :current-page="pageIndex"
          :page-size="pageSize"
          @current-change="handlePageChange"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Calendar, Coin, InfoFilled, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'
import type { ApiError } from '@/types/api'
import type { CreditRecord } from '@/types/credits'

const SOURCE_LABEL_KEYS: Record<string, string> = {
  register: 'credits.sourceRegister',
  sign_in: 'credits.sourceSignIn',
  sign_in_expire: 'credits.sourceSignInExpire',
  recharge: 'credits.sourceRecharge',
  recharge_expire: 'credits.sourceRechargeExpire',
  apple_iap: 'credits.sourceAppleIap',
  apple_iap_expire: 'credits.sourceAppleIapExpire',
  apple_refund: 'credits.sourceAppleRefund',
  image_generate: 'credits.sourceImageGenerate',
  image_refund: 'credits.sourceImageRefund',
  point_expire: 'credits.sourcePointExpire',
}

const app = useAppStore()
const auth = useAuthStore()
const credits = useCreditsStore()
const router = useRouter()
const pageIndex = ref(1)
const pageSize = 20
const summaryRefreshing = ref(false)
const summaryLoadFailed = ref(false)
const recordsLoadFailed = ref(false)

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  if (!auth.user) await auth.fetchCurrentUser().catch(() => undefined)
  await refreshCredits()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

async function refreshCredits() {
  summaryRefreshing.value = true
  try {
    const [summaryResult, recordsResult] = await Promise.allSettled([
      credits.fetchSummary(),
      credits.fetchRecords(pageIndex.value, pageSize),
    ])
    summaryLoadFailed.value = summaryResult.status === 'rejected'
    recordsLoadFailed.value = recordsResult.status === 'rejected'
  } finally {
    summaryRefreshing.value = false
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') void refreshCredits()
}

async function handlePageChange(page: number) {
  const previousPage = pageIndex.value
  pageIndex.value = page
  recordsLoadFailed.value = false
  try {
    await credits.fetchRecords(page, pageSize)
  } catch {
    pageIndex.value = previousPage
    recordsLoadFailed.value = true
  }
}

async function checkIn() {
  try {
    await credits.signIn()
    ElMessage.success(app.t('credits.checkInSuccess'))
  } catch (error) {
    const apiError = error as ApiError
    ElMessage.error(withRequestId(app.t('credits.checkInFailed'), apiError.requestId))
  }
}

function withRequestId(message: string, requestId?: string) {
  return requestId ? `${message} (${app.t('credits.requestId')}: ${requestId})` : message
}

function formatPoints(value?: number | null) {
  const points = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat(app.locale).format(points)
}

function formatAmount(value?: number | null) {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return `${amount > 0 ? '+' : ''}${formatPoints(amount)}`
}

function amountClass(value?: number | null) {
  if (typeof value !== 'number' || value === 0) return 'neutral'
  return value > 0 ? 'income' : 'expense'
}

function formatLocalDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(app.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatRecordType(record: CreditRecord) {
  const source = record.source || record.type
  const labelKey = SOURCE_LABEL_KEYS[source]
  return labelKey ? app.t(labelKey) : record.changeType || record.type
}
</script>

<style scoped>
.credits-page { display: grid; gap: 20px; }
.balance-card { min-height: 252px; padding: 28px; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(280px, .8fr); gap: 32px; background: var(--color-primary-soft); }
.balance-load-error { grid-column: 1 / -1; min-width: 0; display: grid; place-items: center; align-content: center; gap: 14px; text-align: center; color: var(--color-text-muted); }
.balance-load-error > .el-icon { color: var(--el-color-warning); font-size: 30px; }
.balance-load-error strong { color: var(--color-text); font-size: 16px; }
.cached-data-warning { grid-column: 1 / -1; }
.balance-overview { min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.section-label { color: var(--color-text-muted); font-size: 14px; font-weight: 700; }
.balance-total { margin-top: 4px; font-size: 52px; line-height: 1.12; overflow-wrap: anywhere; }
.balance-breakdown { max-width: 520px; margin: 28px 0 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.balance-breakdown > div { min-width: 0; padding-right: 24px; display: grid; gap: 6px; }
.balance-breakdown > div + div { padding-left: 24px; border-left: 1px solid var(--color-border); }
.balance-breakdown dt { color: var(--color-text-muted); font-size: 13px; }
.balance-breakdown dd { margin: 0; font-size: 24px; font-weight: 800; overflow-wrap: anywhere; }
.balance-side { min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.expiry-summary { padding-left: 16px; border-left: 3px solid var(--color-warning); display: grid; gap: 5px; }
.expiry-summary--empty { border-left-color: var(--color-border); }
.expiry-summary span, .expiry-summary time { color: var(--color-text-muted); font-size: 13px; }
.expiry-summary strong { font-size: 18px; }
.balance-actions { margin-top: 24px; display: flex; gap: 10px; flex-wrap: wrap; }
.balance-actions .el-button { margin-left: 0; }
.check-in-status { min-height: 20px; margin: 10px 0 0; color: var(--color-text-muted); font-size: 13px; }
.check-in-status strong { color: var(--color-text); }
.deduction-rule { padding: 20px 24px; display: flex; align-items: flex-start; gap: 14px; }
.deduction-rule > .el-icon { flex: 0 0 auto; margin-top: 2px; color: var(--color-primary); font-size: 20px; }
.deduction-rule h2, .table-header h2 { margin: 0; font-size: 18px; }
.deduction-rule p { margin: 6px 0 0; color: var(--color-text-muted); line-height: 1.65; }
.table-card { min-width: 0; padding: 12px; }
.table-header { padding: 10px 8px 18px; }
.records-refresh-warning { margin-bottom: 12px; }
.table-scroll { width: 100%; overflow-x: auto; }
.records-load-error { min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--color-text-muted); }
.table-scroll :deep(.el-table) { min-width: 760px; }
.table-pagination { display: flex; justify-content: flex-end; padding: 16px 8px 8px; }
.income { color: var(--color-primary); }
.expense { color: var(--color-warning); }
.neutral { color: var(--color-text-muted); }

@media (max-width: 800px) {
  .balance-card { grid-template-columns: 1fr; gap: 28px; }
}

@media (max-width: 520px) {
  .balance-card { padding: 22px 18px; }
  .balance-total { font-size: 42px; }
  .balance-breakdown { margin-top: 22px; }
  .balance-breakdown > div { padding-right: 14px; }
  .balance-breakdown > div + div { padding-left: 14px; }
  .balance-breakdown dd { font-size: 20px; }
  .balance-actions { display: grid; grid-template-columns: 1fr; }
  .balance-actions .el-button { width: 100%; }
  .deduction-rule { padding: 18px; }
  .table-pagination { justify-content: center; overflow-x: auto; }
}
</style>
