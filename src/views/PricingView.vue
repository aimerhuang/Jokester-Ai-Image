<template>
  <div>
    <div v-if="loading" v-loading="true" class="pricing-loading page-card" />

    <div v-else-if="error" class="pricing-state page-card">
      <p>{{ app.t('pricing.loadFailed') }}</p>
      <el-button type="primary" class="soft-button" @click="loadPricing">{{ app.t('pricing.retry') }}</el-button>
    </div>

    <el-empty v-else-if="!groups.length" :description="app.t('pricing.empty')" />

    <div v-else class="pricing-grid">
      <article v-for="group in groups" :key="group.modelCode" class="pricing-card page-card">
        <h2>{{ group.modelName }}</h2>
        <el-table :data="group.rows" size="small">
          <el-table-column prop="resolutionName" :label="app.t('pricing.resolution')" />
          <el-table-column prop="qualityName" :label="app.t('pricing.quality')" />
          <el-table-column :label="app.t('pricing.points')" align="right">
            <template #default="{ row }"><strong class="points">{{ row.points }}</strong></template>
          </el-table-column>
          <el-table-column :label="app.t('pricing.price')" align="right">
            <template #default="{ row }">{{ formatPrice(row) }}</template>
          </el-table-column>
        </el-table>
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
import { computed, onMounted, ref } from 'vue'
import { getPricingOptions } from '@/services/aiImages'
import { useAppStore } from '@/stores/app'
import type { AiImagePricingOption } from '@/types/image'

type PricingApiItem = Partial<AiImagePricingOption> & Record<string, unknown>

interface PricingGroup {
  modelCode: string
  modelName: string
  rows: AiImagePricingOption[]
}

const app = useAppStore()
const options = ref<AiImagePricingOption[]>([])
const loading = ref(false)
const error = ref(false)

const groups = computed<PricingGroup[]>(() => {
  const map = new Map<string, PricingGroup>()
  for (const option of options.value) {
    const key = option.modelCode || option.modelName
    let group = map.get(key)
    if (!group) {
      group = { modelCode: key, modelName: option.modelName || key, rows: [] }
      map.set(key, group)
    }
    group.rows.push(option)
  }
  return [...map.values()].map((group) => ({
    ...group,
    rows: [...group.rows].sort((a, b) => (a.sort || 0) - (b.sort || 0)),
  }))
})

function readString(item: PricingApiItem, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return fallback
}

function readNumber(item: PricingApiItem, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

function unwrapPricingResult(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (!result || typeof result !== 'object') return []
  const payload = result as Record<string, unknown>
  const candidates = [payload.data, payload.items, payload.list, payload.records, payload.rows, payload.pricingOptions, payload.options]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

function normalizePricingOption(item: unknown, index: number): AiImagePricingOption | null {
  if (!item || typeof item !== 'object') return null
  const source = item as PricingApiItem
  const modelCode = readString(source, ['modelCode', 'modelName', 'model', '模型编码', '模型名称'], app.t('pricing.unknownModel'))
  const modelName = readString(source, ['modelName', 'modelDisplayName', 'modelLabel', 'model', '模型名称', '模型'], modelCode)
  const resolutionCode = readString(source, ['resolutionCode', 'resolution', 'size', '分辨率编码', '分辨率'])
  const resolutionName = readString(source, ['resolutionName', 'resolutionDisplayName', 'resolutionLabel', 'resolution', 'size', '分辨率名称', '分辨率'], resolutionCode || '—')
  const qualityCode = readString(source, ['qualityCode', 'quality', 'qualityLevel', '画质编码', '画质'])
  const qualityName = readString(source, ['qualityName', 'qualityDisplayName', 'qualityLabel', 'quality', 'qualityLevel', '画质名称', '画质'], qualityCode || '—')

  return {
    modelCode,
    modelName,
    resolutionCode,
    resolutionName,
    qualityCode,
    qualityName,
    points: readNumber(source, ['points', 'pointCost', 'costPoints', 'credits', 'creditCost', 'point', '积分', '消耗积分'], 0),
    priceAmount: readNumber(source, ['priceAmount', 'price', 'amount', 'referencePrice', '参考价格', '价格'], 0),
    currency: readString(source, ['currency', 'currencyCode', '币种'], 'CNY'),
    sort: readNumber(source, ['sort', 'sortOrder', 'order', '排序'], index),
  }
}

function normalizePricingOptions(result: unknown) {
  return unwrapPricingResult(result)
    .map((item, index) => normalizePricingOption(item, index))
    .filter((item): item is AiImagePricingOption => Boolean(item))
}

function formatPrice(option: AiImagePricingOption) {
  if (!option.priceAmount) return '—'
  const currency = option.currency || 'CNY'
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : ''
  const amount = option.priceAmount.toFixed(2)
  return `${symbol}${amount}${symbol ? '' : ` ${currency}`} / ${app.t('pricing.perImage')}`
}

async function loadPricing() {
  loading.value = true
  error.value = false
  try {
    const result = await getPricingOptions()
    options.value = normalizePricingOptions(result)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadPricing)
</script>

<style scoped>
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
.pricing-card { padding: 24px; display: grid; gap: 16px; align-content: start; }
.billing-notice { margin-top: 20px; padding: 24px; border: 1px solid rgba(111, 127, 63, .22); background: linear-gradient(135deg, rgba(111, 127, 63, .12), rgba(255, 255, 255, .72)); }
.billing-notice h2 { margin: 0 0 14px; font-size: 20px; color: var(--color-primary-hover); }
.billing-notice ul { margin: 0; padding-left: 20px; display: grid; gap: 10px; color: var(--color-text); line-height: 1.7; }
.billing-notice li::marker { color: var(--color-primary); }
.pricing-loading { min-height: 200px; }
.pricing-state { padding: 48px; display: grid; gap: 16px; justify-items: center; text-align: center; }
.pricing-state p { margin: 0; color: var(--color-text-muted); }
h2 { margin: 0; font-size: 20px; }
.points { color: var(--color-primary); }
@media (max-width: 640px) { .pricing-grid { grid-template-columns: 1fr; } }
</style>
