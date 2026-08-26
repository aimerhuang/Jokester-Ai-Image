<template>
  <main class="recharge-page">
    <header class="recharge-header">
      <div class="recharge-brand">
        <span class="brand-icon" aria-hidden="true"><el-icon><Coin /></el-icon></span>
        <strong>{{ app.t('recharge.pageTitle') }}</strong>
      </div>

      <div class="header-actions">
        <MonthlyVipBadge :membership="auth.user?.membership" />
        <span class="balance-pill">
          <span>{{ app.t('recharge.currentBalance') }}</span>
          <strong>{{ formatPoints(credits.summary.balance) }}</strong>
        </span>
        <el-button type="primary" class="redeem-entry" @click="redeemVisible = true">
          <el-icon><Ticket /></el-icon>
          <span>{{ app.t('recharge.redeemEntry') }}</span>
        </el-button>
        <el-tooltip :content="app.t('recharge.close')" placement="bottom">
          <el-button class="close-button" circle plain :aria-label="app.t('recharge.close')" @click="closePage">
            <el-icon><Close /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </header>

    <section class="recharge-intro">
      <h1>{{ app.t('recharge.heading') }}</h1>
      <p>{{ app.t('recharge.subtitle') }}</p>
    </section>

    <section v-loading="credits.rechargeLoading" class="plans-grid" aria-labelledby="recharge-plans-title">
      <h2 id="recharge-plans-title" class="sr-only">{{ app.t('recharge.heading') }}</h2>
      <article
        v-for="plan in plans"
        :key="plan.code"
        class="plan-card"
        :class="[`plan-card--${plan.code}`, { 'plan-card--featured': plan.isFeatured }]"
      >
        <span v-if="plan.badge" class="plan-badge">{{ plan.badge }}</span>

        <div class="plan-heading">
          <h3>{{ plan.displayName }}</h3>
          <div class="points-row">
            <strong>{{ formatPoints(plan.displayPoints) }}</strong>
            <span>{{ app.t('recharge.points') }}</span>
          </div>
          <p>{{ plan.displayDescription }}</p>
          <span v-if="plan.eligibilityHint" class="eligibility-hint">{{ plan.eligibilityHint }}</span>
        </div>

        <ul class="plan-benefits">
          <li v-for="benefit in plan.displayBenefits" :key="benefit">
            <el-icon><CircleCheckFilled /></el-icon>
            <span>{{ benefit }}</span>
          </li>
        </ul>

        <div class="plan-footer">
          <div class="price-row">
            <span>{{ app.t('recharge.priceLabel') }}</span>
            <strong>{{ formatPrice(plan.priceAmount, plan.currency) }}</strong>
            <span>{{ plan.validity }}</span>
          </div>
          <el-button
            class="buy-button"
            :type="plan.isFeatured ? 'warning' : 'primary'"
            size="large"
            :loading="credits.purchasingPackageCode === plan.code"
            :disabled="!plan.purchaseEnabled || orderOutcomeUnknown || Boolean(credits.purchasingPackageCode) || purchaseRetrySeconds > 0"
            @click="buyPlan(plan)"
          >
            <span>{{ buyButtonText(plan) }}</span>
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </article>

      <div v-if="!credits.rechargeLoading && plans.length === 0" class="plans-empty">
        <p>{{ app.t('recharge.packagesLoadFailed') }}</p>
        <el-button plain @click="loadPackages">{{ app.t('common.retry') }}</el-button>
      </div>
    </section>

    <el-dialog
      v-model="redeemVisible"
      class="redeem-dialog"
      :title="app.t('recharge.redeemTitle')"
      width="min(560px, calc(100vw - 32px))"
      align-center
    >
      <div class="redeem-account">
        <span class="redeem-avatar">
          <el-avatar :size="58" :src="auth.user?.avatarUrl || undefined">
            <el-icon><User /></el-icon>
          </el-avatar>
        </span>
        <strong>{{ redeemAccount }}</strong>
      </div>

      <el-form class="redeem-form" @submit.prevent="redeemCode">
        <el-form-item>
          <el-input
            v-model="code"
            size="large"
            clearable
            maxlength="80"
            autocomplete="off"
            autocapitalize="none"
            :spellcheck="false"
            :placeholder="app.t('recharge.redeemPlaceholder')"
            @keyup.enter="redeemCode"
          >
            <template #prefix><el-icon><Ticket /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-button
          class="redeem-submit"
          size="large"
          :loading="credits.redeeming"
          :disabled="!code.trim() || redeemOutcomeUnknown || redeemRetrySeconds > 0"
          @click="redeemCode"
        >
          {{ redeemOutcomeUnknown ? app.t('recharge.resultUnknownButton') : redeemRetrySeconds ? rateLimitText(redeemRetrySeconds) : app.t('recharge.redeemConfirm') }}
        </el-button>
      </el-form>

      <div class="redeem-notice">
        <h3>{{ app.t('recharge.redeemNoticeTitle') }}</h3>
        <ol>
          <li>{{ app.t('recharge.redeemNotice1') }}</li>
          <li>{{ app.t('recharge.redeemNotice2') }}</li>
          <li>{{ app.t('recharge.redeemNotice3') }}</li>
          <li>{{ app.t('recharge.redeemNotice4') }}</li>
        </ol>
      </div>
    </el-dialog>

    <el-dialog
      v-model="orderVisible"
      :title="app.t('recharge.orderCreated')"
      width="min(480px, calc(100vw - 32px))"
      align-center
    >
      <dl v-if="createdOrder" class="order-summary">
        <div><dt>{{ app.t('recharge.orderNumber') }}</dt><dd>{{ createdOrder.orderNo }}</dd></div>
        <div><dt>{{ app.t('recharge.points') }}</dt><dd>{{ formatPoints(createdOrder.points) }}</dd></div>
        <div><dt>{{ app.t('recharge.price') }}</dt><dd>{{ formatPrice(createdOrder.priceAmount, createdOrder.currency) }}</dd></div>
        <div><dt>{{ app.t('recharge.orderExpiresAt') }}</dt><dd>{{ formatDateTime(createdOrder.expiresAt) }}</dd></div>
      </dl>
      <el-alert :title="app.t('recharge.orderPendingPayment')" type="warning" :closable="false" show-icon />
      <template #footer>
        <el-button type="primary" @click="orderVisible = false">{{ app.t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="redeemResultVisible"
      :title="app.t('recharge.redeemResultTitle')"
      width="min(480px, calc(100vw - 32px))"
      align-center
    >
      <dl v-if="redeemResult" class="order-summary redeem-result-summary">
        <div><dt>{{ app.t('recharge.addedPoints') }}</dt><dd class="result-points">+{{ formatPoints(redeemResult.addedPoints) }}</dd></div>
        <div><dt>{{ app.t('recharge.latestBalance') }}</dt><dd>{{ formatPoints(redeemResult.availablePoints) }}</dd></div>
        <div>
          <dt>{{ app.t(redeemResult.expiresAt ? 'recharge.redeemValidUntil' : 'recharge.creditValidity') }}</dt>
          <dd>{{ redeemResult.expiresAt ? formatDateTime(redeemResult.expiresAt) : app.t('recharge.permanent') }}</dd>
        </div>
        <div><dt>{{ app.t('recharge.redeemedAt') }}</dt><dd>{{ formatDateTime(redeemResult.redeemedAt) }}</dd></div>
      </dl>
      <template #footer>
        <el-button type="primary" @click="redeemResultVisible = false">{{ app.t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight, CircleCheckFilled, Close, Coin, Ticket, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import MonthlyVipBadge from '@/components/common/MonthlyVipBadge.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'
import type { ApiError } from '@/types/api'
import type { RechargeOrder, RechargePackage, RedeemPointCodeResult } from '@/types/credits'

interface RechargePlanView extends RechargePackage {
  displayName: string
  displayDescription: string
  displayBenefits: string[]
  displayPoints: number
  badge: string
  validity: string
  eligibilityHint: string
}

const WEB_PACKAGE_CODES = new Set(['monthly', 'trial', 'basic', 'value'])

const badgeCopy: Record<string, string> = {
  recommended: 'recharge.recommended',
  first_offer: 'recharge.firstOffer',
  regular_choice: 'recharge.regularChoice',
  popular: 'recharge.popular',
}

const app = useAppStore()
const auth = useAuthStore()
const credits = useCreditsStore()
const router = useRouter()
const redeemVisible = ref(false)
const orderVisible = ref(false)
const redeemResultVisible = ref(false)
const code = ref('')
const createdOrder = ref<RechargeOrder | null>(null)
const redeemResult = ref<RedeemPointCodeResult | null>(null)
const purchaseRetrySeconds = ref(0)
const redeemRetrySeconds = ref(0)
const orderOutcomeUnknown = ref(false)
const redeemOutcomeUnknown = ref(false)
let rateLimitTimer: ReturnType<typeof setInterval> | null = null

const redeemAccount = computed(() => auth.user?.email || auth.user?.userName || '-')
const plans = computed<RechargePlanView[]>(() => credits.rechargePackages
  .filter((plan) => WEB_PACKAGE_CODES.has(plan.code))
  .sort((a, b) => (a.sort || 0) - (b.sort || 0))
  .map((plan) => {
  const badgeKey = plan.badgeCode ? badgeCopy[plan.badgeCode] : ''
  return {
    ...plan,
    displayName: plan.name,
    displayDescription: plan.description || '',
    displayBenefits: plan.benefits || [],
    displayPoints: plan.code === 'monthly' ? 5000 : plan.points,
    badge: badgeKey ? app.t(badgeKey) : (plan.badgeCode || ''),
    validity: plan.code === 'monthly' ? app.t('recharge.monthlyValidity') : app.t('recharge.permanent'),
    eligibilityHint: plan.code === 'trial'
      ? app.t(plan.isFirstPurchaseEligible ? 'recharge.trialFirstEligible' : 'recharge.trialRepeatEligible')
      : '',
  }
}))

onMounted(() => {
  void Promise.allSettled([
    auth.fetchCurrentUser(),
    credits.fetchSummary(),
    loadPackages(),
  ])
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  clearRateLimitTimer()
})

function closePage() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'playground' })
}

async function loadPackages() {
  try {
    await credits.fetchRechargePackages('web')
  } catch (error) {
    const apiError = error as ApiError
    ElMessage.error(withRequestId(resolveActionError(apiError, app.t('recharge.packagesLoadFailed')), apiError.requestId))
  }
}

async function buyPlan(plan: RechargePackage) {
  if (!plan.purchaseEnabled || orderOutcomeUnknown.value || credits.purchasingPackageCode || purchaseRetrySeconds.value > 0) return
  try {
    const order = await credits.createRechargeOrder(plan.code)
    createdOrder.value = order
    const purchaseUrl = getSafePurchaseUrl(order.purchaseUrl)
    if (purchaseUrl) {
      window.location.assign(purchaseUrl)
      return
    }
    orderVisible.value = true
  } catch (error) {
    const apiError = error as ApiError
    if (isRateLimited(apiError)) {
      startRateLimit('purchase', apiError.retryAfterSeconds)
      ElMessage.warning(rateLimitText(purchaseRetrySeconds.value))
      return
    }
    if (isUnknownOutcome(apiError)) orderOutcomeUnknown.value = true
    ElMessage.error(withRequestId(
      orderOutcomeUnknown.value ? app.t('recharge.orderResultUnknown') : resolveActionError(apiError, app.t('recharge.purchaseFailed')),
      apiError.requestId,
    ))
  }
}

async function redeemCode() {
  const value = code.value.trim()
  if (!value || credits.redeeming || redeemOutcomeUnknown.value || redeemRetrySeconds.value > 0) return
  try {
    const result = await credits.redeemPointCode(value)
    redeemResult.value = result
    code.value = ''
    redeemVisible.value = false
    redeemResultVisible.value = true
    await Promise.allSettled([auth.fetchCurrentUser(), credits.fetchRechargePackages()])
  } catch (error) {
    const apiError = error as ApiError
    if (isRateLimited(apiError)) {
      startRateLimit('redeem', apiError.retryAfterSeconds)
      ElMessage.warning(rateLimitText(redeemRetrySeconds.value))
      return
    }
    if (isUnknownOutcome(apiError)) {
      redeemOutcomeUnknown.value = true
      ElMessage.warning(app.t('recharge.redeemResultUnknown'))
      await Promise.allSettled([credits.fetchSummary(), credits.fetchRecords(), credits.fetchRechargePackages('web')])
      return
    }
    const message = apiError.status === 400
      ? app.t('recharge.redeemInvalid')
      : resolveActionError(apiError, app.t('recharge.redeemFailed'))
    ElMessage.error(withRequestId(message, apiError.requestId))
  }
}

function formatPoints(value: number) {
  return new Intl.NumberFormat(app.locale).format(value)
}

function formatPrice(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(app.locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value}`
  }
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '-'
  return new Intl.DateTimeFormat(app.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function buyButtonText(plan: RechargePackage) {
  if (!plan.purchaseEnabled) return app.t('recharge.purchaseUnavailable')
  if (orderOutcomeUnknown.value) return app.t('recharge.resultUnknownButton')
  if (purchaseRetrySeconds.value) return rateLimitText(purchaseRetrySeconds.value)
  return app.t('recharge.buyNow')
}

function rateLimitText(seconds: number) {
  return app.t('recharge.rateLimitCountdown').replace('{seconds}', String(seconds))
}

function startRateLimit(target: 'purchase' | 'redeem', seconds?: number) {
  const value = Math.max(1, Math.ceil(Number(seconds) || 1))
  if (target === 'purchase') purchaseRetrySeconds.value = value
  else redeemRetrySeconds.value = value
  if (rateLimitTimer) return
  rateLimitTimer = window.setInterval(() => {
    purchaseRetrySeconds.value = Math.max(0, purchaseRetrySeconds.value - 1)
    redeemRetrySeconds.value = Math.max(0, redeemRetrySeconds.value - 1)
    if (!purchaseRetrySeconds.value && !redeemRetrySeconds.value) clearRateLimitTimer()
  }, 1000)
}

function clearRateLimitTimer() {
  if (rateLimitTimer) window.clearInterval(rateLimitTimer)
  rateLimitTimer = null
}

function isRateLimited(error: ApiError) {
  return error.status === 429 || String(error.code).toUpperCase() === 'RATE_LIMITED'
}

function isUnknownOutcome(error: ApiError) {
  return !error.status || [408, 502, 504].includes(error.status)
}

function withRequestId(message: string, requestId?: string) {
  return requestId ? `${message} (${app.t('recharge.requestId')}: ${requestId})` : message
}

function resolveActionError(error: ApiError, fallback: string) {
  const code = String(error.code || '').toUpperCase()
  if (error.status === 409 || code === 'IDEMPOTENCY_CONFLICT') return app.t('recharge.operationConflict')
  if (error.status === 403 || code === 'RESOURCE_FORBIDDEN') return app.t('recharge.actionForbidden')
  if (error.status === 500 || error.status === 503) return app.t('recharge.serviceUnavailable')
  return fallback
}

function getSafePurchaseUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  void Promise.allSettled([credits.fetchSummary(), credits.fetchRechargePackages('web')])
}
</script>

<style scoped>
.recharge-page {
  min-height: 100vh;
  padding: 20px clamp(20px, 4vw, 72px) 72px;
  background: var(--color-bg);
  color: var(--color-text);
}

.recharge-header {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.recharge-brand,
.header-actions,
.balance-pill,
.points-row,
.price-row,
.plan-benefits li {
  display: flex;
  align-items: center;
}

.recharge-brand { gap: 10px; }
.recharge-brand strong { font-size: 16px; }
.brand-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 8px; background: var(--color-primary-soft); color: var(--color-primary-hover); }
.header-actions { gap: 12px; }
.balance-pill { min-height: 40px; gap: 8px; padding: 0 14px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.balance-pill span { color: var(--color-text-muted); font-size: 12px; }
.balance-pill strong { color: var(--color-primary-hover); font-variant-numeric: tabular-nums; }
.redeem-entry { min-height: 42px; border-radius: var(--radius-md); font-weight: 700; }
.close-button { width: 44px; height: 44px; color: var(--color-text); }

.recharge-intro { max-width: 760px; margin: 34px auto 56px; text-align: center; }
.recharge-intro h1 { margin: 0; font-size: 38px; line-height: 1.2; letter-spacing: 0; }
.recharge-intro p { margin: 14px 0 0; color: var(--color-text-muted); line-height: 1.7; }

.plans-grid { min-height: 420px; max-width: 1500px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; align-items: stretch; }
.plan-card { position: relative; min-width: 0; min-height: 540px; padding: 34px 28px 28px; overflow: hidden; display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-card); transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
.plan-card:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); box-shadow: var(--shadow-card-hover); }
.plan-card--featured { border-color: #e9a23b; background: color-mix(in srgb, #fff4de 54%, var(--color-surface)); }
.plan-badge { position: absolute; top: 0; right: 0; min-width: 100px; padding: 9px 16px; border-radius: 0 0 0 8px; background: color-mix(in srgb, var(--color-primary) 14%, var(--color-surface)); color: var(--color-text); text-align: center; font-size: 12px; font-weight: 700; }
.plan-card--featured .plan-badge { background: #ee9a22; color: #fff; }
.plan-heading h3 { margin: 0; font-size: 20px; letter-spacing: 0; }
.points-row { gap: 8px; margin-top: 28px; }
.points-row strong { font-size: 56px; line-height: 1; letter-spacing: 0; font-variant-numeric: tabular-nums; }
.plan-card--featured .points-row strong { color: #e88c00; }
.points-row span { align-self: flex-end; margin-bottom: 8px; color: var(--color-text-muted); font-size: 12px; font-weight: 700; }
.plan-heading p { min-height: 42px; margin: 18px 0 0; color: var(--color-text-muted); font-size: 14px; font-weight: 600; line-height: 1.5; }
.eligibility-hint { display: block; margin-top: 10px; color: var(--color-primary-hover); font-size: 12px; font-weight: 700; line-height: 1.5; }
.plan-benefits { margin: 18px 0 0; padding: 20px 0 0; border-top: 1px solid var(--color-border); display: grid; gap: 14px; list-style: none; }
.plan-benefits li { align-items: flex-start; gap: 10px; color: var(--color-text); font-size: 13px; line-height: 1.5; }
.plan-benefits .el-icon { flex: 0 0 auto; margin-top: 2px; color: #38a881; }
.plan-footer { margin-top: auto; padding-top: 28px; }
.price-row { min-height: 46px; gap: 8px; flex-wrap: wrap; }
.price-row > span { color: var(--color-text-muted); font-size: 12px; font-weight: 700; }
.price-row strong { color: var(--color-text); font-size: 30px; line-height: 1; }
.price-row small { margin-right: 3px; font-size: 18px; }
.buy-button { width: 100%; min-height: 50px; margin-top: 14px; border-radius: var(--radius-md); font-weight: 800; }
.plan-card--featured .buy-button { --el-button-bg-color: #ed920f; --el-button-border-color: #ed920f; --el-button-hover-bg-color: #d98209; --el-button-hover-border-color: #d98209; color: #fff; box-shadow: 0 8px 20px rgba(237, 146, 15, .2); }
.plans-empty { grid-column: 1 / -1; align-self: center; justify-self: center; text-align: center; color: var(--color-text-muted); }

.redeem-account { display: grid; justify-items: center; gap: 14px; margin: 4px 0 28px; }
.redeem-account strong { max-width: 100%; overflow-wrap: anywhere; font-size: 18px; }
.redeem-avatar { width: 70px; height: 70px; display: grid; place-items: center; border: 2px solid var(--color-primary); border-radius: 50%; }
.redeem-avatar :deep(.el-avatar) { background: transparent; color: var(--color-primary); font-size: 30px; }
.redeem-form :deep(.el-input__wrapper) { min-height: 54px; border: 1px solid var(--color-primary); box-shadow: none; }
.redeem-submit { width: 100%; min-height: 54px; border-color: #10110e; background: #10110e; color: #fff; font-weight: 800; }
.redeem-submit:hover, .redeem-submit:focus { border-color: #292b24; background: #292b24; color: #fff; }
.redeem-notice { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--color-border); }
.redeem-notice h3 { margin: 0 0 12px; font-size: 15px; }
.redeem-notice ol { margin: 0; padding-left: 20px; display: grid; gap: 8px; color: var(--color-text-muted); font-size: 13px; line-height: 1.55; }
.order-summary { margin: 0 0 20px; display: grid; gap: 12px; }
.order-summary div { min-width: 0; display: flex; justify-content: space-between; gap: 16px; }
.order-summary dt { color: var(--color-text-muted); }
.order-summary dd { margin: 0; max-width: 70%; overflow-wrap: anywhere; text-align: right; font-weight: 700; }
.redeem-result-summary { margin-bottom: 0; }
.redeem-result-summary .result-points { color: var(--color-primary); font-size: 20px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

:deep(.redeem-dialog .el-dialog__title) { display: block; width: 100%; text-align: center; font-weight: 800; }
:deep(.redeem-dialog .el-dialog__body) { padding-top: 12px; }

@media (max-width: 1180px) {
  .plans-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 800px; }
  .plan-card { min-height: 520px; }
}

@media (max-width: 680px) {
  .recharge-page { padding: 16px 16px 48px; }
  .recharge-header { align-items: flex-start; }
  .header-actions { flex-wrap: wrap; justify-content: flex-end; }
  .balance-pill { order: 3; }
  .recharge-intro { margin: 42px auto 36px; }
  .recharge-intro h1 { font-size: 30px; }
  .plans-grid { grid-template-columns: 1fr; }
  .plan-card { min-height: 500px; padding: 32px 24px 24px; }
  .points-row strong { font-size: 50px; }
}

@media (max-width: 480px) {
  .recharge-brand strong { display: none; }
  .balance-pill { width: 100%; justify-content: center; }
  .redeem-entry { padding-left: 12px; padding-right: 12px; }
}
</style>
