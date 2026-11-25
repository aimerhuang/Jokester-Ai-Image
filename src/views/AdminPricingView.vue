<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PricingAuditDrawer from '@/components/pricing/PricingAuditDrawer.vue'
import { pricingAdmin, type Model, type Overview, type Preview, type Row, type Slot } from '@/services/adminPricing'
import type { ApiError } from '@/types/api'
import { useAppStore } from '@/stores/app'

const app = useAppStore(),
  t = (key: string) => app.t(`adminPricing.${key}`)
const data = ref<Overview>(),
  drafts = ref<Record<number, Row>>({})
const busy = ref(false),
  error = ref(''),
  search = ref(''),
  missing = ref(false),
  manual = ref(false),
  audit = ref(false)
const dialog = ref<'batch' | 'discount' | 'access' | 'add' | null>(null),
  target = ref<Model | null>(null)
const slot = ref<Slot>(),
  reason = ref(''),
  large = ref(false),
  last = ref(false),
  requireLast = ref(false),
  requireLarge = ref(false)
const followDefault = ref(false),
  rate = ref(80),
  preview = ref<Preview | null>(null),
  newPoints = ref<number>(),
  amount = ref(0)
const open = computed({
  get: () => dialog.value !== null,
  set: (v) => {
    if (!v && !busy.value) dialog.value = null
  },
})
const groups = computed(() =>
  (data.value?.models || []).filter(
    (m) =>
      `${m.modelCode} ${m.modelName}`.toLowerCase().includes(search.value.trim().toLowerCase()) &&
      (!missing.value || m.missingPrices.length) &&
      (!manual.value || m.prices.some((r) => r.vipPriceMode === 'manual')),
  ),
)
const changes = computed(() =>
  (data.value?.models || []).flatMap((model) =>
    model.prices.flatMap((old) => {
      const row = drafts.value[old.id]
      return row &&
        ['points', 'vipPriceMode', 'vipPoints', 'priceAmount', 'status'].some(
          (k) => row[k as keyof Row] !== old[k as keyof Row],
        )
        ? [{ model, old, row }]
        : []
    }),
  ),
)
const slotName = (row: Slot) => [row.resolutionCode.toUpperCase(), row.qualityCode].filter(Boolean).join(' / ')
const pay = (row: Row, model: Model) =>
  row.vipPriceMode === 'manual' ? row.vipPoints : auto(row.points, model.effectiveDiscountPercent)
function auto(points: number, discount: number) {
  const vip = Math.ceil((points * discount) / 100)
  return vip < points ? vip : null
}
function changeMode(row: Row, model: Model, mode: Row['vipPriceMode']) {
  row.vipPoints = mode === 'manual' ? pay(row, model) : auto(row.points, model.effectiveDiscountPercent)
  row.vipPriceMode = mode
}
function invalidPoints(n: unknown) {
  return typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 100000
}
function invalid(row: Row) {
  return (
    invalidPoints(row.points) ||
    !Number.isFinite(row.priceAmount) ||
    row.priceAmount < 0 ||
    (row.vipPriceMode === 'manual' &&
      row.vipPoints != null &&
      (invalidPoints(row.vipPoints) || row.vipPoints >= row.points))
  )
}
async function load() {
  const fresh = await pricingAdmin.read()
  drafts.value = Object.fromEntries(fresh.models.flatMap((m) => m.prices.map((r) => [r.id, { ...r }])))
  data.value = fresh
}
async function refresh() {
  busy.value = true
  error.value = ''
  try {
    await load()
  } catch (err) {
    error.value = (err as ApiError).message || t('reloadFailed')
  } finally {
    busy.value = false
  }
}
function begin(kind: NonNullable<typeof dialog.value>, model: Model | null = null, missingSlot?: Slot) {
  dialog.value = kind
  target.value = model
  slot.value = missingSlot
  reason.value = ''
  preview.value = null
  rate.value = model?.effectiveDiscountPercent ?? data.value!.defaultVipDiscountPercent
  followDefault.value = model !== null && model.vipDiscountPercent === null
  newPoints.value = undefined
  amount.value = 0
  large.value = false
  last.value = false
  requireLast.value = false
  requireLarge.value = false
  if (kind === 'batch') {
    const beyond = (before: number, after: number) =>
      Math.abs(after - before) * 100 > before * data.value!.largeChangePercent
    requireLarge.value = changes.value.some(
      ({ old, row }) =>
        beyond(old.points, row.points) ||
        (row.vipPriceMode === 'manual' && beyond(old.vipPoints ?? old.points, row.vipPoints ?? row.points)),
    )
  }
}
watch(
  [followDefault, rate],
  () => {
    preview.value = null
  },
  { flush: 'sync' },
)
const discountValue = () => (target.value && followDefault.value ? null : rate.value)
async function getPreview() {
  if (discountValue() !== null && (invalidPoints(rate.value) || rate.value > 100)) return ElMessage.error(t('invalid'))
  busy.value = true
  try {
    preview.value = await pricingAdmin.preview(target.value?.modelCode ?? null, discountValue())
  } catch (err) {
    ElMessage.error((err as ApiError).message)
  } finally {
    busy.value = false
  }
}
async function save() {
  if (busy.value) return
  const comment = reason.value.trim()
  if (!comment || comment.length > 200) return ElMessage.error(t('invalidReason'))
  busy.value = true
  try {
    if (dialog.value === 'batch') {
      if (changes.value.length > 200) return ElMessage.error(t('limit'))
      if (changes.value.some(({ row }) => invalid(row))) return ElMessage.error(t('invalid'))
      await pricingAdmin.batch(
        changes.value.map((c) => c.row),
        comment,
        large.value,
        last.value,
      )
    } else if (dialog.value === 'discount' && preview.value) {
      await pricingAdmin.discount(target.value?.modelCode ?? null, discountValue(), preview.value.previewToken, comment)
    } else if (dialog.value === 'access' && target.value) {
      await pricingAdmin.access(target.value, target.value.accessLevel === 'all' ? 'vip_only' : 'all', comment)
    } else if (dialog.value === 'add' && target.value && slot.value) {
      if (invalidPoints(newPoints.value) || !Number.isFinite(amount.value) || amount.value < 0)
        return ElMessage.error(t('invalid'))
      await pricingAdmin.create(slot.value, target.value.modelCode, newPoints.value!, amount.value, comment)
    } else return
    dialog.value = null
    ElMessage.success(t('saved'))
    await refresh()
  } catch (err) {
    const failure = err as ApiError
    if (failure.code === 'PRICE_REVISION_CONFLICT') {
      dialog.value = null
      ElMessage.warning(t('conflict'))
      await refresh()
    } else {
      if (failure.code === 'PRICE_LAST_ENABLED') requireLast.value = true
      if (failure.code === 'PRICE_CHANGE_TOO_LARGE') requireLarge.value = true
      ElMessage.error(failure.message)
    }
  } finally {
    busy.value = false
  }
}
onMounted(refresh)
</script>
<template>
  <main class="pricing-admin" v-loading="busy && !dialog">
    <el-alert v-if="error" type="error" :title="error" :closable="false"
      ><el-button @click="refresh">{{ t('retry') }}</el-button></el-alert
    >
    <template v-if="data">
      <section class="page-card controls">
        <strong>{{ t('defaultDiscount') }}　{{ data.defaultVipDiscountPercent }}%</strong>
        <el-button :disabled="!!changes.length" @click="begin('discount')">{{ t('edit') }}</el-button>
        <span class="grow" /><el-button @click="audit = true">{{ t('audits') }}</el-button>
        <el-button type="primary" :disabled="!changes.length || !!error" @click="begin('batch')"
          >{{ t('review') }} ({{ changes.length }})</el-button
        >
      </section>
      <div class="filters">
        <el-input v-model="search" clearable :placeholder="t('search')" /><el-checkbox v-model="missing">{{
          t('missingOnly')
        }}</el-checkbox
        ><el-checkbox v-model="manual">{{ t('manualOnly') }}</el-checkbox>
      </div>
      <el-empty v-if="!groups.length" :description="t('empty')" />
      <section v-for="model in groups" :key="model.modelCode" class="page-card model">
        <header class="controls">
          <div>
            <h2>{{ model.modelName }}</h2>
            <small
              >{{ model.modelCode }} · {{ model.providerProtocol }} · {{ model.sizeContractVersion }} ·
              {{ t('routes') }} {{ model.enabledRouteCount }}</small
            >
          </div>
          <span class="grow" />
          <el-button :disabled="!!changes.length" @click="begin('discount', model)"
            >{{ model.vipDiscountPercent === null ? t('followDefault') : t('modelDiscount') }}
            {{ model.effectiveDiscountPercent }}%</el-button
          >
          <el-switch
            :aria-label="t('vipOnly')"
            :active-text="t('vipOnly')"
            :disabled="!!changes.length"
            :model-value="model.accessLevel === 'vip_only'"
            @change="begin('access', model)"
          />
        </header>
        <div class="table-wrap" v-if="!missing">
          <table>
            <thead>
              <tr>
                <th v-for="col in ['slot', 'points', 'mode', 'vipPoints', 'saving', 'amount', 'enabled']" :key="col">
                  {{ t(col) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in model.prices
                  .filter((r) => !manual || r.vipPriceMode === 'manual')
                  .map((r) => drafts[r.id]!)"
                :key="row.id"
                :data-testid="`price-${row.id}`"
              >
                <th>{{ slotName(row) }}</th>
                <td>
                  <el-input-number
                    v-model="row.points"
                    :min="1"
                    :max="100000"
                    :precision="0"
                    :controls="false"
                    :aria-label="t('points')"
                  />
                </td>
                <td>
                  <select
                    :aria-label="t('mode')"
                    :value="row.vipPriceMode"
                    @change="changeMode(row, model, ($event.target as HTMLSelectElement).value as Row['vipPriceMode'])"
                  >
                    <option value="follow">{{ t('follow') }}</option>
                    <option value="manual">{{ t('manual') }}</option>
                  </select>
                </td>
                <td>
                  <el-input-number
                    v-if="row.vipPriceMode === 'manual'"
                    :model-value="row.vipPoints ?? undefined"
                    :min="1"
                    :max="100000"
                    :precision="0"
                    :controls="false"
                    :placeholder="t('noDiscount')"
                    :aria-label="t('vipPoints')"
                    @update:model-value="(v: number | null | undefined) => (row.vipPoints = v ?? null)"
                  /><span v-else>{{ pay(row, model) ?? t('noDiscount') }}</span>
                </td>
                <td>{{ row.points ? ((1 - (pay(row, model) ?? row.points) / row.points) * 100).toFixed(1) : '—' }}%</td>
                <td>
                  <el-input-number
                    v-model="row.priceAmount"
                    :min="0"
                    :precision="2"
                    :controls="false"
                    :aria-label="t('amount')"
                  />
                </td>
                <td>
                  <el-switch v-model="row.status" :active-value="1" :inactive-value="0" :aria-label="t('enabled')" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-for="s in manual ? [] : model.missingPrices" :key="slotName(s)" class="missing">
          <span>{{ slotName(s) }} · {{ t('missing') }}</span
          ><el-button size="small" :disabled="!!changes.length" @click="begin('add', model, s)">{{
            t('add')
          }}</el-button>
        </div>
        <details v-if="model.sizeContractVersion === 'size-mode-v1' || model.releasePrices.length">
          <summary>{{ t('release') }}</summary>
          <p>{{ t('releaseHint') }}</p>
          <p v-for="r in model.releasePrices" :key="[r.sizeMode, r.resolutionCode, r.qualityCode].join('/')">
            {{ [r.sizeMode, r.resolutionCode, r.qualityCode].filter(Boolean).join(' / ') }}　{{ r.points }}
          </p>
        </details>
      </section>
    </template>
    <PricingAuditDrawer v-model="audit" />
    <el-dialog
      v-model="open"
      :close-on-click-modal="false"
      :close-on-press-escape="!busy"
      :show-close="!busy"
      width="min(620px,94vw)"
      :title="t(({ batch: 'batch', discount: 'discount', access: 'access', add: 'add' } as const)[dialog || 'batch'])"
    >
      <div v-if="dialog" class="dialog-body">
        <strong v-if="target">{{ target.modelName }} {{ slot ? ' · ' + slotName(slot) : '' }}</strong>
        <template v-if="dialog === 'batch'"
          ><div class="diff" v-for="{ old, row, model } in changes" :key="row.id">
            <b>{{ model.modelName }} · {{ slotName(row) }}</b>
            <span
              >{{ t('points') }}　{{ old.points }} → {{ row.points }}　 {{ t('vipPoints') }}　{{
                old.vipPoints ?? t('noDiscount')
              }}
              → {{ pay(row, model) ?? t('noDiscount') }}</span
            >
            <span v-if="old.priceAmount !== row.priceAmount"
              >{{ t('amount') }}　{{ old.priceAmount }} → {{ row.priceAmount }}</span
            >
            <span v-if="old.vipPriceMode !== row.vipPriceMode"
              >{{ t('mode') }}　{{ t(old.vipPriceMode) }} → {{ t(row.vipPriceMode) }}</span
            >
            <span v-if="old.status !== row.status"
              >{{ t('enabled') }}　{{ t(old.status ? 'enabled' : 'disabled') }} →
              {{ t(row.status ? 'enabled' : 'disabled') }}</span
            >
          </div>
          <el-checkbox v-if="requireLarge" v-model="large">{{ t('large') }}</el-checkbox
          ><el-checkbox v-if="requireLast" v-model="last">{{ t('last') }}</el-checkbox></template
        >
        <template v-else-if="dialog === 'discount'">
          <el-checkbox v-if="target" v-model="followDefault" :disabled="busy">{{ t('followDefault') }}</el-checkbox>
          <label
            >{{ t('percent') }}　<el-input-number
              v-model="rate"
              :min="1"
              :max="100"
              :precision="0"
              :disabled="busy || (!!target && followDefault)"
          /></label>
          <el-button :loading="busy" @click="getPreview">{{ t('preview') }}</el-button>
          <template v-if="preview"
            ><strong>{{ t('impacted') }}　{{ preview.modelCount }} / {{ preview.priceCount }}</strong>
            <div v-for="r in preview.changes" :key="r.id">
              {{ r.modelCode }} · {{ slotName(r) }}　{{ r.oldVipPoints ?? t('noDiscount') }} →
              {{ r.newVipPoints ?? t('noDiscount') }}
            </div>
            <strong v-if="preview.manualPrices.length">{{ t('manualUnchanged') }}</strong>
            <div v-for="r in preview.manualPrices" :key="r.id">
              {{ r.modelCode }} · {{ slotName(r) }}　{{ r.oldVipPoints ?? t('noDiscount') }}
            </div>
          </template>
        </template>
        <template v-else-if="dialog === 'add'"
          ><label
            >{{ t('points') }}　<el-input-number v-model="newPoints" :min="1" :max="100000" :precision="0" /></label
          ><label>{{ t('amount') }}　<el-input-number v-model="amount" :min="0" :precision="2" /></label
          ><span v-if="newPoints && target"
            >{{ t('vipPoints') }}　{{ auto(newPoints, target.effectiveDiscountPercent) ?? t('noDiscount') }}</span
          ></template
        >
        <strong v-else-if="dialog === 'access'"
          >{{ t(target?.accessLevel === 'all' ? 'allUsers' : 'vipOnly') }} →
          {{ t(target?.accessLevel === 'all' ? 'vipOnly' : 'allUsers') }}</strong
        >
        <el-input
          v-model="reason"
          type="textarea"
          :maxlength="200"
          show-word-limit
          :placeholder="t('reason')"
          :aria-label="t('reason')"
        />
      </div>
      <template #footer
        ><el-button :disabled="busy" @click="open = false">{{ t('cancel') }}</el-button
        ><el-button
          type="primary"
          :loading="busy"
          :disabled="
            !reason.trim() || (dialog === 'discount' && !preview) || (requireLarge && !large) || (requireLast && !last)
          "
          @click="save"
          >{{ t('apply') }}</el-button
        ></template
      >
    </el-dialog>
  </main>
</template>
<style scoped>
.pricing-admin,
.dialog-body,
.diff {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.page-card {
  padding: 20px;
}
.controls,
.filters,
.missing {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.controls .el-button + .el-button {
  margin-left: 0;
}
.grow {
  flex: 1;
}
.filters .el-input {
  width: 230px;
}
h2 {
  font-size: 18px;
  margin: 0 0 4px;
}
small {
  color: var(--color-text-muted);
}
.table-wrap {
  overflow: auto;
  margin-top: 16px;
}
table {
  border-collapse: collapse;
  width: 100%;
  text-align: left;
}
td,
th {
  padding: 9px 7px;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
thead th {
  color: var(--color-text-muted);
  font-size: 12px;
}
td .el-input-number {
  width: 88px;
}
select {
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px;
}
.missing,
details {
  margin-top: 14px;
}
.missing {
  color: var(--color-danger);
}
.dialog-body {
  max-height: 60vh;
  overflow: auto;
  padding: 2px;
}
.diff {
  gap: 4px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 8px;
}
</style>
