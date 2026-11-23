<template>
  <el-drawer
    :model-value="modelValue"
    :title="drawerTitle"
    size="720px"
    class="model-route-audit-drawer"
    @update:model-value="emit('update:modelValue', $event)"
    @open="load(1)"
  >
    <div v-loading="loading" class="audit-body" data-testid="model-route-audits">
      <el-empty v-if="!loading && !items.length" :description="app.t('modelConfig.auditEmpty')" />
      <el-table v-else :data="items" size="small" row-key="id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="audit-diff">
              <div v-if="row.beforeJson">
                <strong>{{ app.t('modelConfig.auditBefore') }}</strong>
                <pre>{{ pretty(row.beforeJson) }}</pre>
              </div>
              <div>
                <strong>{{ app.t('modelConfig.auditAfter') }}</strong>
                <pre>{{ pretty(row.afterJson) }}</pre>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.auditTime')" width="150">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.auditOperator')" width="110">
          <template #default="{ row }">{{ row.operatorUserName || `#${row.operatorUserId}` }}</template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.auditAction')" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="actionTagType(row.action)" disable-transitions>{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.auditRoute')" min-width="160">
          <template #default="{ row }">{{ routeLabel(row) }}</template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.auditFields')" min-width="140">
          <template #default="{ row }">{{ row.changedFields.join(', ') }}</template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="total > pageSize"
        class="audit-pagination"
        layout="prev, pager, next"
        small
        :page-size="pageSize"
        :total="total"
        :current-page="page"
        @current-change="load"
      />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { getModelRouteAudits } from '@/services/models'
import { useAppStore } from '@/stores/app'
import type { ApiError } from '@/types/api'
import type { ModelRoute, ModelRouteAudit, ModelRouteAuditAction } from '@/types/models'

const props = defineProps<{
  modelValue: boolean
  /** Limit to one route; null shows every route. */
  route: ModelRoute | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const app = useAppStore()
const pageSize = 50
const page = ref(1)
const total = ref(0)
const items = ref<ModelRouteAudit[]>([])
const loading = ref(false)

const drawerTitle = computed(() => props.route
  ? `${app.t('modelConfig.auditTitle')} · ${routeLabel(props.route)}`
  : app.t('modelConfig.auditTitle'))

async function load(nextPage: number) {
  loading.value = true
  try {
    const result = await getModelRouteAudits({ configId: props.route?.id, page: nextPage, pageSize })
    items.value = result.items
    total.value = result.total
    page.value = nextPage
  } catch (error) {
    ElMessage.error((error as ApiError).message)
  } finally {
    loading.value = false
  }
}

function routeLabel(route: Pick<ModelRouteAudit, 'modelCode' | 'resolutionCode' | 'routeRole'>) {
  const resolution = route.resolutionCode ? route.resolutionCode.toUpperCase() : app.t('modelConfig.generic')
  const role = route.routeRole === 'primary' ? app.t('modelConfig.rolePrimary') : app.t('modelConfig.roleFallback')
  return `${route.modelCode} / ${resolution} / ${role}`
}

function actionLabel(action: ModelRouteAuditAction) {
  return app.t(`modelConfig.${({
    create: 'actionCreate',
    update: 'actionUpdate',
    enable: 'actionEnable',
    disable: 'actionDisable',
    rotate_key: 'actionRotateKey',
  } as const)[action] ?? 'actionUpdate'}`)
}

function actionTagType(action: ModelRouteAuditAction) {
  return ({ create: 'success', update: 'primary', enable: 'success', disable: 'danger', rotate_key: 'warning' } as const)[action] ?? 'info'
}

function pretty(json: string | null) {
  if (!json) return '—'
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

function formatTime(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style scoped>
.audit-body { min-height: 200px; display: grid; gap: 16px; align-content: start; }
.audit-diff { padding: 4px 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.audit-diff strong { font-size: 12px; color: var(--color-text-muted); }
.audit-diff pre { margin: 6px 0 0; padding: 10px; overflow-x: auto; border-radius: var(--radius-sm); background: var(--color-bg); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
.audit-pagination { justify-content: center; }
</style>
