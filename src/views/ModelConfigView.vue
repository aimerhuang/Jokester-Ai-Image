<template>
  <div class="model-config-page">
    <section class="config-toolbar page-card">
      <el-input v-model="keyword" clearable :placeholder="app.t('modelConfig.searchPlaceholder')" class="keyword-input" data-testid="model-config-search">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="statusFilter" class="status-filter">
        <el-option :label="app.t('modelConfig.statusAll')" value="all" />
        <el-option :label="app.t('modelConfig.statusEnabled')" value="enabled" />
        <el-option :label="app.t('modelConfig.statusDisabled')" value="disabled" />
      </el-select>
      <div class="toolbar-actions">
        <el-button type="primary" class="soft-button" data-testid="model-config-add-model" @click="openCreateModel">
          <el-icon><Plus /></el-icon><span>{{ app.t('modelConfig.addModel') }}</span>
        </el-button>
        <el-button class="soft-button" :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon><span>{{ app.t('modelConfig.refresh') }}</span>
        </el-button>
        <el-button class="soft-button" @click="openAudits(null)">
          <el-icon><Document /></el-icon><span>{{ app.t('modelConfig.audits') }}</span>
        </el-button>
      </div>
    </section>

    <div v-if="loading && !groups.length" v-loading="true" class="config-loading page-card" />

    <div v-else-if="loadError && !groups.length" class="config-state page-card">
      <p>{{ app.t('modelConfig.loadFailed') }}</p>
      <el-button type="primary" class="soft-button" @click="load">{{ app.t('common.retry') }}</el-button>
    </div>

    <el-empty v-else-if="!visibleGroups.length" :description="app.t('modelConfig.empty')" />

    <section v-for="group in visibleGroups" :key="group.modelCode" class="model-group page-card" :data-model-code="group.modelCode">
      <header class="group-head">
        <div class="group-title">
          <h2>{{ group.modelName }}</h2>
          <code>{{ group.modelCode }}</code>
          <ModelStatusBadge v-if="group.state" :state="group.state" />
          <el-tag v-if="group.missingPrimaryRoute" type="warning" size="small" effect="plain" disable-transitions>{{ app.t('modelConfig.missingPrimary') }}</el-tag>
          <el-tag v-if="offersGif(group)" type="success" size="small" effect="plain" disable-transitions data-testid="model-gif-tag">{{ app.t('modelConfig.gifEnabled') }}</el-tag>
        </div>
        <el-button type="primary" class="soft-button" plain @click="openCreate(group.modelCode)">
          <el-icon><Plus /></el-icon><span>{{ app.t('modelConfig.addRoute') }}</span>
        </el-button>
      </header>

      <el-table :data="group.routes" size="small" row-key="id" class="route-table">
        <el-table-column :label="app.t('modelConfig.resolution')" width="84">
          <template #default="{ row }">{{ row.resolutionCode ? row.resolutionCode.toUpperCase() : app.t('modelConfig.generic') }}</template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.role')" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="row.routeRole === 'primary' ? 'primary' : 'info'" disable-transitions>
              {{ row.routeRole === 'primary' ? app.t('modelConfig.rolePrimary') : app.t('modelConfig.roleFallback') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.enabled')" width="96">
          <template #default="{ row }">
            <div class="status-cell">
              <el-tooltip :disabled="!isDisableLocked(row)" :content="app.t('modelConfig.publishedLockedHint')" placement="top">
                <el-switch
                  :model-value="row.status === 1"
                  :loading="statusSaving === row.id"
                  :disabled="isDisableLocked(row)"
                  :before-change="() => toggleStatus(row)"
                  :data-testid="`route-status-${row.id}`"
                />
              </el-tooltip>
              <el-tooltip v-if="row.publishedCatalogVersions.length" :content="app.t('modelConfig.publishedLockedHint')" placement="top">
                <el-icon class="lock-icon"><Lock /></el-icon>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.providerModel')" min-width="160">
          <template #default="{ row }">
            <div class="stacked-cell">
              <span class="ellipsis" :title="row.providerModel">{{ row.providerModel }}</span>
              <span class="muted">{{ row.providerProtocol || row.provider }}</span>
              <span v-if="row.gifProviderModel" class="gif-model ellipsis" :title="row.gifProviderModel" :data-testid="`route-gif-${row.id}`">GIF · {{ row.gifProviderModel }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.baseUrl')" min-width="220">
          <template #default="{ row }">
            <div class="url-cell">
              <span class="url-text" :title="row.baseUrl">{{ row.baseUrl }}</span>
              <el-button link size="small" :icon="CopyDocument" :aria-label="app.t('modelConfig.baseUrl')" @click="copy(row.baseUrl)" />
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.apiKey')" width="120">
          <template #default="{ row }">
            <code v-if="row.apiKeySet" class="key-mask" data-testid="route-key-mask">{{ row.apiKeyMask }}</code>
            <span v-else class="key-missing">{{ app.t('modelConfig.apiKeyMissing') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.requestFormat')" width="140" prop="requestFormat" />
        <el-table-column :label="app.t('modelConfig.updated')" width="150">
          <template #default="{ row }">
            <div class="stacked-cell">
              <span>{{ formatTime(row.updatedAt) }}</span>
              <span v-if="row.updatedBy" class="muted">{{ row.updatedBy }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="app.t('modelConfig.actions')" width="176" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :data-testid="`route-edit-${row.id}`" @click="openEdit(row)">{{ app.t('modelConfig.edit') }}</el-button>
            <el-button link type="primary" size="small" :loading="testing === row.id" :disabled="!row.apiKeySet" :data-testid="`route-test-${row.id}`" @click="runTest(row)">{{ app.t('modelConfig.test') }}</el-button>
            <el-button link size="small" @click="openAudits(row)">{{ app.t('modelConfig.history') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <ModelRouteFormDialog
      v-model="formVisible"
      :route="editingRoute"
      :groups="groups"
      :resolution-options="resolutionOptions"
      :default-model-code="createModelCode"
      :new-model="creatingModel"
      @saved="handleSaved"
      @failed="handleError"
    />
    <ModelRouteAuditDrawer v-model="auditVisible" :route="auditRoute" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Document, Lock, Plus, Refresh, Search } from '@element-plus/icons-vue'
import ModelRouteAuditDrawer from '@/components/models/ModelRouteAuditDrawer.vue'
import ModelRouteFormDialog from '@/components/models/ModelRouteFormDialog.vue'
import ModelStatusBadge from '@/components/models/ModelStatusBadge.vue'
import { getImageParameters } from '@/services/aiImages'
import { getModelRoutes, testModelRoute, updateModelRouteStatus } from '@/services/models'
import { AUTH_REFRESHED_NOT_REPLAYED } from '@/services/http'
import { useAppStore } from '@/stores/app'
import { sortImageResolutionCodes } from '@/stores/imageOptions'
import type { ApiError } from '@/types/api'
import type { ModelRoute, ModelRouteGroup } from '@/types/models'

const app = useAppStore()
const router = useRouter()
const groups = ref<ModelRouteGroup[]>([])
const loading = ref(false)
const loadError = ref(false)
const keyword = ref('')
const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all')
const parameterResolutions = ref<string[]>([])
const formVisible = ref(false)
const editingRoute = ref<ModelRoute | null>(null)
const createModelCode = ref<string>()
const creatingModel = ref(false)
const auditVisible = ref(false)
const auditRoute = ref<ModelRoute | null>(null)
const statusSaving = ref<number | null>(null)
const testing = ref<number | null>(null)

const visibleGroups = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return groups.value
    .filter((group) => !query
      || group.modelCode.toLowerCase().includes(query)
      || group.modelName.toLowerCase().includes(query))
    .map((group) => ({
      ...group,
      routes: group.routes.filter((route) => statusFilter.value === 'all'
        || (statusFilter.value === 'enabled' ? route.status === 1 : route.status === 0)),
    }))
    .filter((group) => group.routes.length > 0)
})

const resolutionOptions = computed(() => sortImageResolutionCodes([
  ...parameterResolutions.value,
  ...groups.value.flatMap((group) => group.routes.map((route) => route.resolutionCode)),
].map((code) => code.trim().toLowerCase()).filter(Boolean)))

async function load() {
  loading.value = true
  try {
    groups.value = await getModelRoutes()
    loadError.value = false
  } catch (error) {
    loadError.value = true
    if (groups.value.length) ElMessage.error((error as ApiError).message)
  } finally {
    loading.value = false
  }
}

async function loadResolutions() {
  try {
    const parameters = await getImageParameters()
    parameterResolutions.value = parameters.resolutions.map((item) => item.code)
  } catch {
    // Falls back to resolutions already used by routes.
  }
}

function replaceRoute(updated: ModelRoute) {
  for (const group of groups.value) {
    const index = group.routes.findIndex((route) => route.id === updated.id)
    if (index >= 0) group.routes.splice(index, 1, updated)
  }
}

/** Mirrors the backend: an enabled route with a key and a native GIF model makes the model GIF-capable. */
function offersGif(group: ModelRouteGroup) {
  return group.routes.some((route) => route.status === 1 && route.apiKeySet && Boolean(route.gifProviderModel)
    && !(route.providerProtocol ?? route.provider).includes('gemini'))
}

function isDisableLocked(route: ModelRoute) {
  return route.status === 1 && route.publishedCatalogVersions.length > 0
}

function openCreate(modelCode?: string) {
  editingRoute.value = null
  creatingModel.value = false
  createModelCode.value = modelCode
  formVisible.value = true
}

function openCreateModel() {
  editingRoute.value = null
  creatingModel.value = true
  createModelCode.value = undefined
  formVisible.value = true
}

function openEdit(route: ModelRoute) {
  editingRoute.value = route
  creatingModel.value = false
  formVisible.value = true
}

function openAudits(route: ModelRoute | null) {
  auditRoute.value = route
  auditVisible.value = true
}

async function handleSaved(route: ModelRoute, created: boolean) {
  const newModel = created && creatingModel.value
  creatingModel.value = false
  ElMessage.success(app.t(created ? 'modelConfig.createSuccess' : 'modelConfig.saveSuccess'))
  await load()
  if (route.apiKeySet) {
    const testNow = await ElMessageBox.confirm(app.t('modelConfig.testAfterSave'), app.t('modelConfig.testAfterSaveTitle'), {
      confirmButtonText: app.t('modelConfig.testNow'),
      cancelButtonText: app.t('modelConfig.later'),
      type: 'info',
    }).then(() => true).catch(() => false)
    if (testNow) await runTest(route)
  }
  if (!newModel) return
  // A model without prices stays hidden from the image page, so point the admin at pricing right away.
  const goPricing = await ElMessageBox.confirm(app.t('modelConfig.newModelPricing'), app.t('modelConfig.newModelPricingTitle'), {
    confirmButtonText: app.t('modelConfig.goPricing'),
    cancelButtonText: app.t('modelConfig.later'),
    type: 'info',
  }).then(() => true).catch(() => false)
  if (goPricing) await router.push({ name: 'admin-pricing' })
}

/** Central error handling for route writes. */
async function handleError(error: ApiError) {
  if (error.code === AUTH_REFRESHED_NOT_REPLAYED) {
    ElMessage.warning({ message: app.t('modelConfig.sessionRenewedRetry'), duration: 6000 })
    return
  }
  if (error.code === 'MODEL_ROUTE_REVISION_CONFLICT') {
    ElMessage.warning(app.t('modelConfig.revisionConflict'))
    formVisible.value = false
    await load()
    return
  }
  if (error.code === 'MODEL_ROUTE_LOCKED_BY_RELEASE') {
    ElMessage.warning({ message: app.t('modelConfig.lockedByRelease'), duration: 6000 })
    return
  }
  ElMessage.error(error.message)
}

async function toggleStatus(route: ModelRoute): Promise<boolean> {
  const status = route.status === 1 ? 0 : 1
  statusSaving.value = route.id
  try {
    const updated = await saveStatus(route, status, false)
    if (updated) {
      replaceRoute(updated)
      ElMessage.success(app.t(status === 1 ? 'modelConfig.enabledSuccess' : 'modelConfig.disabledSuccess'))
      void load()
    }
  } finally {
    statusSaving.value = null
  }
  // The row is updated from the server response, so the switch never flips on its own.
  return false
}

async function saveStatus(route: ModelRoute, status: 0 | 1, confirmOffline: boolean): Promise<ModelRoute | null> {
  try {
    return await updateModelRouteStatus(route.id, { revision: route.revision, status, confirmOffline })
  } catch (raw) {
    const error = raw as ApiError
    if (error.code === 'MODEL_ROUTE_OFFLINE_CONFIRM_REQUIRED' && !confirmOffline) {
      const resolutions = readResolutionCodes(error.details)
      const confirmed = await ElMessageBox.confirm(
        app.t('modelConfig.offlineConfirm').replace('{resolutions}', resolutions || '—'),
        app.t('modelConfig.offlineConfirmTitle'),
        { confirmButtonText: app.t('modelConfig.confirmOffline'), cancelButtonText: app.t('common.cancel'), type: 'warning' },
      ).then(() => true).catch(() => false)
      return confirmed ? saveStatus(route, status, true) : null
    }
    await handleError(error)
    return null
  }
}

function readResolutionCodes(details: unknown) {
  if (!details || typeof details !== 'object') return ''
  const source = details as Record<string, unknown>
  const codes = source.resolutionCodes ?? source.ResolutionCodes
  return Array.isArray(codes) ? codes.map((code) => String(code).toUpperCase()).join(', ') : ''
}

async function runTest(route: ModelRoute) {
  testing.value = route.id
  try {
    const result = await testModelRoute(route.id)
    const status = result.httpStatus === null || result.httpStatus === undefined ? '' : String(result.httpStatus)
    if (result.result === 'passed') {
      ElMessage.success(app.t('modelConfig.testPassed').replace('{status}', status).replace('{ms}', String(result.elapsedMilliseconds)))
    } else if (result.result === 'auth_failed') {
      ElMessage.error(app.t('modelConfig.testAuthFailed').replace('{status}', status))
    } else {
      ElMessage.warning({ message: app.t('modelConfig.testUnreachable').replace('{status}', status ? ` (HTTP ${status})` : ''), duration: 6000 })
    }
  } catch (error) {
    await handleError(error as ApiError)
  } finally {
    testing.value = null
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(app.t('modelConfig.copied'))
  } catch {
    ElMessage.error(app.t('modelConfig.copyFailed'))
  }
}

function formatTime(value: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—'
}

onMounted(() => {
  void load()
  void loadResolutions()
})
</script>

<style scoped>
.model-config-page { display: grid; gap: 20px; }
.config-toolbar { padding: 14px 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.keyword-input { width: 280px; }
.status-filter { width: 140px; }
.toolbar-actions { margin-left: auto; display: flex; gap: 8px; }
.toolbar-actions .el-icon, .group-head .el-icon { margin-right: 6px; }
.config-loading { min-height: 240px; }
.config-state { padding: 48px; display: grid; gap: 16px; justify-items: center; text-align: center; }
.config-state p { margin: 0; color: var(--color-text-muted); }
.model-group { min-width: 0; padding: 20px; display: grid; gap: 14px; }
.group-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.group-title { min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.group-title h2 { margin: 0; font-size: 18px; }
.group-title code { color: var(--color-text-muted); font-size: 12px; }
.route-table { width: 100%; }
.url-cell { min-width: 0; display: flex; align-items: center; gap: 4px; }
.url-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-mask { font-family: inherit; font-size: 12px; white-space: nowrap; }
.key-missing { color: var(--color-status-down); font-weight: 600; }
.status-cell { display: flex; align-items: center; gap: 6px; }
.lock-icon { color: var(--color-warning); }
.stacked-cell { min-width: 0; display: grid; line-height: 1.4; }
.stacked-cell .muted { font-size: 12px; }
.stacked-cell .gif-model { font-size: 12px; color: var(--color-primary); }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 640px) { .keyword-input, .status-filter { width: 100%; } .toolbar-actions { margin-left: 0; } }
</style>
