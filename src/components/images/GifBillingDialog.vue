<template>
  <el-dialog v-model="open" width="min(820px, 94vw)" append-to-body class="gif-billing-dialog" :aria-label="app.t('gif.rule')">
    <template #header>
      <div class="dialog-heading">
        <span class="heading-icon" aria-hidden="true"><el-icon><Tickets /></el-icon></span>
        <div>
          <h2>{{ app.t('gif.rule') }}</h2>
          <p>{{ app.t('gif.ruleSubtitle') }}</p>
        </div>
      </div>
    </template>

    <section class="notice">
      <h3>{{ app.t('gif.formulaTitle') }}</h3>
      <p>{{ formulaText }}</p>
    </section>

    <section class="rate-cards" :aria-label="app.t('gif.perFrameTitle')">
      <article v-for="code in qualityCodes" :key="code" class="rate-card" :class="{ active: code === qualityCode }">
        <span class="rate-kind">{{ qualityLabel(code) }}</span>
        <strong class="rate-value">{{ app.t('gif.perFrame').replace('{points}', String(capability.reserve.perFramePoints[code])) }}</strong>
      </article>
    </section>

    <section class="panel">
      <h3>{{ app.t('gif.tableTitle') }}</h3>
      <p class="muted">{{ app.t('gif.tableHint').replace('{points}', String(capability.reserve.perReferencePoints)) }}</p>
      <div class="table-scroll">
        <table class="price-table">
          <thead>
            <tr>
              <th scope="col">{{ app.t('playground.quality') }}</th>
              <th v-for="n in capability.frameCounts" :key="n" scope="col">{{ app.t('gif.frameOption').replace('{count}', String(n)) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="code in qualityCodes" :key="code">
              <th scope="row">{{ qualityLabel(code) }}</th>
              <td v-for="n in capability.frameCounts" :key="n" :class="{ active: code === qualityCode && n === frameCount }">{{ price(code, n, 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="currentPoints != null" class="current" aria-live="polite">
      <span>{{ currentText }}</span>
      <strong>{{ app.t('gif.pointsEach').replace('{points}', String(currentPoints)) }}</strong>
    </section>

    <p class="footnote">{{ app.t('gif.settlement') }}</p>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Tickets } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { getLocalizedImageOptionLabel } from '@/stores/imageOptions'
import type { GifCapability } from '@/types/image'
import { calculateReservePoints } from '@/utils/gifBilling'

const app = useAppStore()
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ capability: GifCapability; qualityCode: string; frameCount?: number | null; referenceCount: number }>()
const qualityCodes = computed(() => ['low', 'med', 'high'].filter(code => Number.isInteger(props.capability.reserve.perFramePoints[code])))
const formulaText = computed(() => app.t('gif.formulaBody')
  .replace('{base}', String(props.capability.reserve.basePoints))
  .replace('{reference}', String(props.capability.reserve.perReferencePoints)))
const currentPoints = computed(() => props.frameCount ? price(props.qualityCode, props.frameCount, props.referenceCount) : null)
const currentText = computed(() => app.t('gif.current')
  .replace('{quality}', qualityLabel(props.qualityCode))
  .replace('{frames}', String(props.frameCount ?? '—'))
  .replace('{references}', String(props.referenceCount)))

function price(quality: string, frames: number, references: number) {
  return calculateReservePoints(props.capability.reserve, quality, frames, references) ?? '—'
}

function qualityLabel(code: string) {
  return getLocalizedImageOptionLabel('qualities', code, app.locale)
}
</script>

<style scoped>
.dialog-heading { display: flex; align-items: center; gap: 14px; }
.heading-icon {
  display: grid; place-items: center; width: 48px; height: 48px; flex: none;
  border-radius: var(--radius-md); background: var(--color-primary-soft); color: var(--color-primary); font-size: 24px;
}
.dialog-heading h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--color-text); }
.dialog-heading p { margin: 2px 0 0; color: var(--color-text-muted); }
section + section, section + .footnote { margin-top: 16px; }
.notice {
  padding: 16px 20px; border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-primary-soft) 70%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
}
.notice h3 { margin: 0 0 6px; color: var(--color-primary); font-size: 16px; }
.notice p { margin: 0; line-height: 1.7; color: var(--color-text); }
.rate-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.rate-card {
  display: grid; gap: 8px; padding: 16px; border-radius: var(--radius-lg);
  border: 1px solid var(--color-border); background: var(--color-surface);
}
.rate-card.active { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary) inset; }
.rate-kind { color: var(--color-text-muted); }
.rate-value { font-size: 18px; color: var(--color-warning); }
.panel {
  padding: 16px 20px; border-radius: var(--radius-lg);
  border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg) 60%, var(--color-surface));
}
.panel h3 { margin: 0 0 6px; font-size: 16px; color: var(--color-text); }
.muted { margin: 0; color: var(--color-text-muted); line-height: 1.6; }
.table-scroll { overflow-x: auto; margin-top: 12px; }
.price-table { width: 100%; border-collapse: collapse; background: var(--color-surface); font-variant-numeric: tabular-nums; }
.price-table th, .price-table td { padding: 8px 10px; text-align: center; border: 1px solid var(--color-border); white-space: nowrap; }
.price-table thead th, .price-table tbody th { color: var(--color-text-muted); font-weight: 600; }
.price-table td.active { background: var(--color-primary-soft); color: var(--color-primary); font-weight: 700; }
.current {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px;
  border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted);
}
.current strong { font-size: 18px; color: var(--color-text); }
.footnote { margin: 0; color: var(--color-text-muted); font-size: 13px; line-height: 1.6; }
@media (max-width: 640px) {
  .rate-cards { grid-template-columns: 1fr; }
}
</style>
