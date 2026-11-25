<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { pricingAdmin, type Audit } from '@/services/adminPricing'
import type { ApiError } from '@/types/api'

const open = defineModel<boolean>({ required: true })
const app = useAppStore()
const t = (key: string) => app.t(`adminPricing.${key}`)
const modelCode = ref(''),
  operator = ref(''),
  changeType = ref('')
const range = ref<[Date, Date] | null>(null),
  page = ref(1),
  total = ref(0)
const items = ref<Audit[]>([]),
  loading = ref(false),
  error = ref('')
let generation = 0
async function load(index = 1) {
  const version = ++generation
  page.value = index
  loading.value = true
  error.value = ''
  try {
    const result = await pricingAdmin.audits({
      pageIndex: index,
      pageSize: 25,
      modelCode: modelCode.value.trim() || undefined,
      operatorUserId: operator.value === '' ? undefined : Number(operator.value),
      changeType: changeType.value || undefined,
      startTime: range.value?.[0].toISOString(),
      endTime: range.value?.[1].toISOString(),
    })
    if (version === generation) {
      items.value = result.items
      total.value = result.total
    }
  } catch (err) {
    if (version === generation) error.value = (err as ApiError).message
  } finally {
    if (version === generation) loading.value = false
  }
}
function fields(raw: string | null) {
  if (!raw) return '—'
  try {
    return Object.entries(JSON.parse(raw))
      .map(([name, value]) => `${name} = ${value ?? '—'}`)
      .join(' · ')
  } catch {
    return raw
  }
}
watch(open, (value) => {
  if (value) void load()
})
</script>
<template>
  <el-drawer v-model="open" :title="t('audits')" size="min(820px, 95vw)">
    <form class="filters" @submit.prevent="load()">
      <el-input v-model="modelCode" :placeholder="t('search')" clearable />
      <el-input v-model="operator" type="number" min="0" :placeholder="t('operator')" clearable />
      <el-select v-model="changeType" clearable :placeholder="t('changeType')"
        ><el-option
          v-for="type in ['points', 'vipPoints', 'discount', 'access']"
          :key="type"
          :label="t(type)"
          :value="type"
      /></el-select>
      <el-date-picker
        v-model="range"
        type="datetimerange"
        :start-placeholder="t('start')"
        :end-placeholder="t('end')"
      />
      <el-button native-type="submit" :loading="loading">{{ t('filter') }}</el-button>
    </form>
    <el-alert v-if="error" type="error" :title="error" :closable="false" />
    <el-empty v-else-if="!loading && !items.length" :description="t('noAudit')" />
    <article v-for="item in items" :key="item.id">
      <header>
        <strong
          >{{ item.modelCode || item.targetType }} ·
          {{ [item.resolutionCode, item.qualityCode, item.action].filter(Boolean).join(' / ') }}</strong
        ><time>{{ new Date(item.createdAt).toLocaleString(app.locale) }}</time>
      </header>
      <p>
        {{ item.operatorUserId === 0 ? t('system') : item.operatorUserName || item.operatorUserId }} · {{ item.reason }}
      </p>
      <p>{{ t('before') }}　{{ fields(item.beforeJson) }}</p>
      <p>{{ t('after') }}　{{ fields(item.afterJson) }}</p>
      <small>{{ t('batchId') }}　{{ item.batchId }}</small>
    </article>
    <el-pagination
      v-if="total > 25"
      :current-page="page"
      :page-size="25"
      :total="total"
      layout="prev, pager, next"
      @current-change="load"
    />
  </el-drawer>
</template>
<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.filters .el-input,
.filters .el-select {
  width: 160px;
}
article {
  padding: 16px 0;
  border-top: 1px solid var(--color-border);
  overflow-wrap: anywhere;
}
header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
time,
small {
  color: var(--color-text-muted);
}
p {
  margin: 7px 0;
}
</style>
