<template>
  <div>
    <div v-if="loading && !groups.length" v-loading="true" class="pricing-loading page-card" />

    <div v-else-if="error" class="pricing-state page-card">
      <p>{{ app.t('pricing.loadFailed') }}</p>
      <el-button type="primary" class="soft-button" @click="loadPricing">{{ app.t('pricing.retry') }}</el-button>
    </div>

    <el-empty v-else-if="!groups.length" :description="app.t('pricing.empty')" />

    <div v-else class="pricing-grid">
      <article v-for="group in groups" :key="group.modelCode" class="pricing-card">
        <header class="pricing-card-head">
          <ModelIcon :provider="group.provider" :code="group.modelCode" />
          <h2>{{ group.modelName }}</h2>
          <span v-if="group.vipOnly" class="member-badge">{{ app.t('pricing.memberOnly') }}</span>
        </header>

        <div class="price-table-wrap">
          <table class="price-table">
            <thead>
              <tr>
                <th scope="col" class="slot">{{ group.modelName }}</th>
                <th scope="col">{{ app.t('pricing.points') }}</th>
                <th scope="col">{{ app.t('pricing.standardUser') }}</th>
                <th scope="col" class="monthly">{{ app.t('pricing.monthlyUser') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in group.rows" :key="row.key">
                <th scope="row" class="slot">{{ row.label }}</th>
                <td class="points">
                  <template v-if="row.vipPoints != null">
                    <s class="list-points">{{ row.points }}</s>
                    <span class="member-points"><strong>{{ row.vipPoints }}</strong><small>{{ app.t('pricing.memberPrice') }}</small></span>
                  </template>
                  <strong v-else>{{ row.points }}</strong>
                </td>
                <td class="standard-price">{{ row.standardPrice }}</td>
                <td class="monthly">{{ row.monthlyPrice }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <section class="billing-notice page-card">
      <h2>{{ app.t('pricing.billingNoticeTitle') }}</h2>
      <ul>
        <li><strong>{{ app.t('pricing.deductionTitle') }}</strong>{{ app.t('pricing.deductionDescription') }}</li>
        <li><strong>{{ app.t('pricing.refundTitle') }}</strong>{{ app.t('pricing.refundDescription') }}</li>
        <li><strong>{{ app.t('pricing.checkInBonusTitle') }}</strong>{{ app.t('pricing.checkInBonusDescription') }}</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ModelIcon from '@/components/images/ModelIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { getStoredToken } from '@/services/http'
import { getRechargePackages } from '@/services/credits'
import { normalizePricingOption, unwrapPricingResult } from '@/utils/imagePricing'
import { isVipOnlyModel } from '@/utils/modelPresentation'
import { getPricingOptions } from '@/services/aiImages'
import { useAppStore } from '@/stores/app'
import { useImageOptionsStore } from '@/stores/imageOptions'
import type { AiImagePricingOption } from '@/types/image'
import type { RechargePackage } from '@/types/credits'

interface PricingRow {
  key: string
  label: string
  points: number
  vipPoints: number | null
  standardPrice: string
  monthlyPrice: string
  order: [number, number, number]
}

interface PricingGroup {
  modelCode: string
  modelName: string
  provider?: string
  vipOnly: boolean
  order: number
  rows: PricingRow[]
}

const RESOLUTION_ORDER = ['1k', '2k', '4k']
const QUALITY_ORDER = ['low', 'med', 'medium', 'high', 'xhigh', 'max']
const QUALITY_LABELS: Record<string, string> = { low: 'Low', med: 'Medium', medium: 'Medium', high: 'High', xhigh: 'Xhigh', max: 'Max' }

const app = useAppStore()
const auth = useAuthStore()
const optionsStore = useImageOptionsStore()
let requestId = 0
const options = ref<AiImagePricingOption[]>([])
const monthlyPackage = ref<RechargePackage | null>(null)
const loading = ref(false)
const error = ref(false)

function rank(list: string[], value: string | null | undefined) {
  const index = list.indexOf((value || '').toLowerCase())
  return index < 0 ? list.length : index
}

function slotLabel(option: AiImagePricingOption) {
  const resolution = option.resolutionCode ? option.resolutionCode.toUpperCase() : 'Auto'
  const quality = (option.qualityCode || '').toLowerCase()
  if (!quality) return resolution
  const label = QUALITY_LABELS[quality] || quality.charAt(0).toUpperCase() + quality.slice(1)
  return `${resolution}-${label}`
}

function currencySymbol(currency?: string | null) {
  return !currency || currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `
}

function formatMinor(minor: number, currency?: string | null) {
  return `${currencySymbol(currency)}${(minor / 100).toFixed(2)}`
}

/** What a monthly-pass holder pays: their per-image points valued at the monthly pass rate, rounded down to the cent. */
function monthlyPrice(points: number) {
  const pass = monthlyPackage.value
  if (!pass || pass.points <= 0 || pass.priceMinorUnits <= 0) return '—'
  return formatMinor(Math.floor((points * pass.priceMinorUnits) / pass.points), pass.currency)
}

const groups = computed<PricingGroup[]>(() => {
  const models = optionsStore.options.models || []
  const map = new Map<string, PricingGroup>()
  for (const option of options.value) {
    const code = option.modelCode || option.modelName
    const modelIndex = models.findIndex((model) => model.value === code)
    const model = models[modelIndex]
    let group = map.get(code)
    if (!group) {
      group = {
        modelCode: code,
        modelName: model?.name || model?.label || option.modelName || code || app.t('pricing.unknownModel'),
        provider: model?.provider,
        vipOnly: model ? isVipOnlyModel(model) : false,
        order: modelIndex < 0 ? Number.MAX_SAFE_INTEGER : modelIndex,
        rows: [],
      }
      map.set(code, group)
    }
    const vipPoints = option.vipPoints != null && option.vipPoints < option.points ? option.vipPoints : null
    group.rows.push({
      key: `${option.resolutionCode || 'auto'}:${option.qualityCode || ''}`,
      label: slotLabel(option),
      points: option.points,
      vipPoints,
      standardPrice: (option.priceMinorUnits ?? 0) > 0 ? formatMinor(option.priceMinorUnits ?? 0, option.currency)
        : option.priceAmount > 0 ? `${currencySymbol(option.currency)}${option.priceAmount.toFixed(2)}` : '—',
      monthlyPrice: monthlyPrice(vipPoints ?? option.points),
      order: [option.points, rank(RESOLUTION_ORDER, option.resolutionCode), rank(QUALITY_ORDER, option.qualityCode)],
    })
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2]),
    }))
    .sort((a, b) => a.order - b.order || a.modelCode.localeCompare(b.modelCode))
})

function normalizePricingOptions(result: unknown) {
  return unwrapPricingResult(result)
    .map((item, index) => normalizePricingOption(item, index))
    .filter((item): item is AiImagePricingOption => Boolean(item))
}

async function loadPricing() {
  const id = ++requestId
  const owner = auth.user?.id
  loading.value = true
  error.value = false
  try {
    // Model names, providers and the monthly pass rate only decorate the table; their failure must not hide prices.
    const [result, packages] = await Promise.all([
      getPricingOptions(),
      getRechargePackages('web').catch(() => [] as RechargePackage[]),
      optionsStore.fetchOptions().catch(() => undefined),
    ])
    if (id !== requestId) return
    if (auth.user?.id !== owner || auth.token !== getStoredToken()) throw new Error('Session changed')
    options.value = normalizePricingOptions(result)
    monthlyPackage.value = packages.find((item) => item.code === 'monthly') || null
  } catch {
    if (id === requestId) error.value = true
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch([() => auth.user?.id, () => auth.token], loadPricing, { immediate: true })
onMounted(() => {
  window.addEventListener('focus', loadPricing)
  window.addEventListener('vip:changed', loadPricing)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', loadPricing)
  window.removeEventListener('vip:changed', loadPricing)
})
</script>

<style scoped>
.pricing-grid {
  /* Member pricing: dark olive green in light mode, light green in dark mode. */
  --monthly-accent: #4f5f1f;
  --monthly-soft: rgba(79, 95, 31, .07);
  --monthly-head: rgba(79, 95, 31, .14);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 24px;
  align-items: start;
}
html.dark .pricing-grid { --monthly-accent: #bcd88f; --monthly-soft: rgba(188, 216, 143, .08); --monthly-head: rgba(188, 216, 143, .16); }

.pricing-card {
  display: grid;
  gap: 18px;
  padding: 22px 22px 24px;
  border: 1px solid var(--color-border);
  border-radius: 22px;
  background: color-mix(in srgb, var(--color-surface) 70%, var(--color-bg));
  box-shadow: 0 10px 30px rgba(31, 35, 25, .04);
}
.pricing-card-head { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border); }
.pricing-card-head h2 { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: .01em; }
.member-badge { margin-left: auto; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--monthly-accent); background: var(--monthly-head); }

.price-table-wrap { overflow-x: auto; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); }
.price-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.price-table th, .price-table td { padding: 12px 14px; text-align: center; border-bottom: 1px solid var(--color-border); border-right: 1px solid var(--color-border); }
.price-table tr > :last-child { border-right: 0; }
.price-table tbody tr:last-child > * { border-bottom: 0; }
.price-table thead th { font-size: 12px; font-weight: 600; color: var(--color-text-muted); background: color-mix(in srgb, var(--color-text) 6%, var(--color-surface)); white-space: nowrap; }
.price-table .slot { width: 36%; text-align: left; }
.price-table tbody .slot { font-weight: 600; color: var(--color-text); }
.price-table tbody tr:hover > * { background: color-mix(in srgb, var(--color-primary) 4%, transparent); }

.points strong { font-size: 15px; color: var(--color-text); }
.list-points { display: block; font-size: 11px; line-height: 1.1; color: var(--color-text-muted); }
.member-points { display: inline-flex; align-items: baseline; gap: 3px; }
.member-points small { font-size: 11px; font-weight: 600; color: var(--monthly-accent); }
.standard-price { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.price-table .monthly { color: var(--monthly-accent); background: var(--monthly-soft); font-weight: 700; font-variant-numeric: tabular-nums; }
.price-table thead .monthly { background: var(--monthly-head); }
.price-table tbody tr:hover > .monthly { background: var(--monthly-head); }

.billing-notice { margin-top: 24px; padding: 24px; border: 1px solid rgba(111, 127, 63, .22); background: linear-gradient(135deg, rgba(111, 127, 63, .12), rgba(255, 255, 255, .72)); }
.billing-notice h2 { margin: 0 0 14px; font-size: 20px; color: var(--color-primary-hover); }
.billing-notice ul { margin: 0; padding-left: 20px; display: grid; gap: 10px; color: var(--color-text); line-height: 1.7; }
.billing-notice li::marker { color: var(--color-primary); }
.pricing-loading { min-height: 200px; }
.pricing-state { padding: 48px; display: grid; gap: 16px; justify-items: center; text-align: center; }
.pricing-state p { margin: 0; color: var(--color-text-muted); }
@media (max-width: 720px) {
  .pricing-grid { grid-template-columns: 1fr; }
  .pricing-card { padding: 16px; }
  .price-table th, .price-table td { padding: 10px 8px; }
}
</style>
