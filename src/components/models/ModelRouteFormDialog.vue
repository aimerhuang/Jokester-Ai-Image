<template>
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? app.t('modelConfig.editTitle') : app.t('modelConfig.createTitle')"
    width="600px"
    class="model-route-dialog"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @open="resetForm"
    @closed="form.apiKey = ''"
  >
    <el-alert v-if="locked" type="warning" :closable="false" show-icon class="locked-alert" :title="app.t('modelConfig.publishedLockedHint')" />

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="route-form" data-testid="model-route-form" @submit.prevent>
      <div class="form-grid">
        <el-form-item :label="app.t('modelConfig.model')" prop="modelCode">
          <el-select v-if="!isEdit" v-model="form.modelCode" filterable data-testid="route-model-select" @change="handleModelChange">
            <el-option v-for="group in groups" :key="group.modelCode" :label="`${group.modelName} (${group.modelCode})`" :value="group.modelCode" />
          </el-select>
          <el-input v-else :model-value="form.modelCode" disabled />
        </el-form-item>
        <el-form-item :label="app.t('modelConfig.modelName')" prop="modelName">
          <el-input v-model="form.modelName" maxlength="100" />
        </el-form-item>

        <el-form-item :label="app.t('modelConfig.resolution')">
          <el-select v-if="!isEdit" v-model="form.resolutionCode" data-testid="route-resolution-select">
            <el-option :label="app.t('modelConfig.generic')" value="" />
            <el-option v-for="code in resolutionOptions" :key="code" :label="code.toUpperCase()" :value="code" />
          </el-select>
          <el-input v-else :model-value="form.resolutionCode ? form.resolutionCode.toUpperCase() : app.t('modelConfig.generic')" disabled />
        </el-form-item>
        <el-form-item :label="app.t('modelConfig.role')">
          <el-radio-group v-model="form.routeRole" :disabled="isEdit">
            <el-radio-button value="primary">{{ app.t('modelConfig.rolePrimary') }}</el-radio-button>
            <el-radio-button value="fallback">{{ app.t('modelConfig.roleFallback') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="app.t('modelConfig.provider')" prop="provider">
          <el-select v-model="form.provider" :disabled="isEdit" filterable allow-create default-first-option>
            <el-option v-for="provider in providerOptions" :key="provider" :label="provider" :value="provider" />
          </el-select>
        </el-form-item>
        <el-form-item :label="app.t('modelConfig.providerModel')" prop="providerModel">
          <el-input v-model="form.providerModel" maxlength="100" :disabled="locked" data-testid="route-provider-model" />
        </el-form-item>
      </div>

      <el-form-item :label="app.t('modelConfig.baseUrl')" prop="baseUrl">
        <el-input v-model="form.baseUrl" maxlength="500" :placeholder="app.t('modelConfig.baseUrlPlaceholder')" :disabled="locked" data-testid="route-base-url" />
      </el-form-item>

      <el-form-item :label="app.t('modelConfig.apiKey')" prop="apiKey">
        <el-input
          v-model="form.apiKey"
          type="password"
          show-password
          autocomplete="new-password"
          maxlength="500"
          :placeholder="apiKeyPlaceholder"
          data-testid="route-api-key"
        />
        <span class="field-hint">{{ app.t('modelConfig.apiKeyNotice') }}</span>
      </el-form-item>

      <div class="form-grid">
        <el-form-item :label="app.t('modelConfig.textToImagePath')">
          <el-input v-model="form.textToImagePath" maxlength="200" placeholder="/images/generations" :disabled="locked" />
        </el-form-item>
        <el-form-item :label="app.t('modelConfig.imageToImagePath')">
          <el-input v-model="form.imageToImagePath" maxlength="200" placeholder="/images/edits" :disabled="locked" />
        </el-form-item>
        <el-form-item :label="app.t('modelConfig.requestFormat')">
          <el-select v-model="form.requestFormat">
            <el-option label="openai-size" value="openai-size" />
            <el-option label="prompt-aspect-ratio" value="prompt-aspect-ratio" />
          </el-select>
        </el-form-item>
        <el-form-item :label="app.t('modelConfig.sort')">
          <el-input-number v-model="form.sort" :step="1" controls-position="right" />
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="app.t('modelConfig.status')">
          <el-switch v-model="form.enabled" :active-text="app.t('modelConfig.enabled')" />
        </el-form-item>
      </div>
      <p class="field-hint">{{ app.t('modelConfig.modelNameHint') }}</p>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ app.t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" data-testid="route-save" @click="submit">{{ app.t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { createModelRoute, updateModelRoute } from '@/services/models'
import { useAppStore } from '@/stores/app'
import type { ApiError } from '@/types/api'
import type { ModelRoute, ModelRouteGroup, ModelRouteRequestFormat, ModelRouteRole } from '@/types/models'

const props = defineProps<{
  modelValue: boolean
  /** Route being edited; null creates a new route. */
  route: ModelRoute | null
  groups: ModelRouteGroup[]
  resolutionOptions: string[]
  defaultModelCode?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [route: ModelRoute, created: boolean]
  failed: [error: ApiError]
}>()

const app = useAppStore()
const formRef = ref<FormInstance>()
const saving = ref(false)
const form = reactive({
  modelCode: '',
  modelName: '',
  resolutionCode: '',
  routeRole: 'primary' as ModelRouteRole,
  provider: '',
  providerModel: '',
  baseUrl: '',
  apiKey: '',
  textToImagePath: '/images/generations',
  imageToImagePath: '/images/edits',
  requestFormat: 'openai-size' as ModelRouteRequestFormat,
  sort: 0,
  enabled: true,
})

const isEdit = computed(() => Boolean(props.route))
const locked = computed(() => Boolean(props.route?.publishedCatalogVersions.length))
const providerOptions = computed(() => [...new Set([
  'openai',
  'gemini-image',
  ...props.groups.flatMap((group) => group.routes.map((route) => route.provider)),
])].filter(Boolean))
const apiKeyPlaceholder = computed(() => isEdit.value
  ? app.t('modelConfig.apiKeyKeepPlaceholder').replace('{mask}', props.route?.apiKeyMask || app.t('modelConfig.apiKeyMissing'))
  : app.t('modelConfig.apiKeyNewPlaceholder'))

const rules = computed<FormRules>(() => ({
  modelCode: [requiredRule('model')],
  modelName: [requiredRule('modelName')],
  provider: [requiredRule('provider')],
  providerModel: [requiredRule('providerModel')],
  baseUrl: [requiredRule('baseUrl'), { pattern: /^https?:\/\/\S+$/i, message: app.t('modelConfig.baseUrlPlaceholder'), trigger: 'blur' }],
  apiKey: isEdit.value ? [] : [requiredRule('apiKey')],
}))

function requiredRule(field: string) {
  return { required: true, whitespace: true, message: app.t('modelConfig.required').replace('{field}', app.t(`modelConfig.${field}`)), trigger: 'blur' }
}

function resetForm() {
  const route = props.route
  if (route) {
    Object.assign(form, {
      modelCode: route.modelCode,
      modelName: route.modelName,
      resolutionCode: route.resolutionCode,
      routeRole: route.routeRole,
      provider: route.provider,
      providerModel: route.providerModel,
      baseUrl: route.baseUrl,
      apiKey: '',
      textToImagePath: route.textToImagePath,
      imageToImagePath: route.imageToImagePath,
      requestFormat: route.requestFormat,
      sort: route.sort,
      enabled: route.status === 1,
    })
  } else {
    Object.assign(form, {
      modelCode: '',
      modelName: '',
      resolutionCode: '',
      routeRole: 'fallback',
      provider: '',
      providerModel: '',
      baseUrl: '',
      apiKey: '',
      textToImagePath: '/images/generations',
      imageToImagePath: '/images/edits',
      requestFormat: 'openai-size',
      sort: 0,
      enabled: true,
    })
    const initial = props.defaultModelCode || props.groups[0]?.modelCode
    if (initial) handleModelChange(initial)
  }
  formRef.value?.clearValidate()
}

/** Prefill a new route from the model's existing primary route so the protocol matches. */
function handleModelChange(modelCode: string) {
  form.modelCode = modelCode
  const group = props.groups.find((item) => item.modelCode === modelCode)
  const template = group?.routes.find((route) => route.routeRole === 'primary') ?? group?.routes[0]
  form.modelName = group?.modelName ?? ''
  if (!template) return
  form.provider = template.provider
  form.providerModel = template.providerModel
  form.textToImagePath = template.textToImagePath
  form.imageToImagePath = template.imageToImagePath
  form.requestFormat = template.requestFormat
  form.sort = template.sort
}

function hasSensitiveChange(route: ModelRoute) {
  return Boolean(form.apiKey.trim())
    || form.baseUrl.trim() !== route.baseUrl
    || form.providerModel.trim() !== route.providerModel
    || form.textToImagePath.trim() !== route.textToImagePath
    || form.imageToImagePath.trim() !== route.imageToImagePath
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const route = props.route
  if (route && hasSensitiveChange(route)) {
    const confirmed = await ElMessageBox.confirm(app.t('modelConfig.sensitiveConfirm'), app.t('modelConfig.sensitiveConfirmTitle'), {
      confirmButtonText: app.t('common.confirm'),
      cancelButtonText: app.t('common.cancel'),
      type: 'warning',
    }).then(() => true).catch(() => false)
    if (!confirmed) return
  }

  saving.value = true
  try {
    const saved = route
      ? await updateModelRoute(route.id, {
        revision: route.revision,
        modelName: form.modelName.trim(),
        providerModel: form.providerModel.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim() || undefined,
        textToImagePath: form.textToImagePath.trim() || undefined,
        imageToImagePath: form.imageToImagePath.trim() || undefined,
        requestFormat: form.requestFormat,
        sort: form.sort,
      })
      : await createModelRoute({
        modelCode: form.modelCode,
        modelName: form.modelName.trim(),
        resolutionCode: form.resolutionCode,
        routeRole: form.routeRole,
        provider: form.provider.trim(),
        providerModel: form.providerModel.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        textToImagePath: form.textToImagePath.trim() || undefined,
        imageToImagePath: form.imageToImagePath.trim() || undefined,
        requestFormat: form.requestFormat,
        sort: form.sort,
        status: form.enabled ? 1 : 0,
      })
    form.apiKey = ''
    emit('update:modelValue', false)
    emit('saved', saved, !route)
  } catch (error) {
    emit('failed', error as ApiError)
  } finally {
    // The typed key survives a failed attempt for retry, and is cleared on success and when the dialog closes.
    saving.value = false
  }
}
</script>

<style scoped>
.locked-alert { margin-bottom: 16px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.form-grid :deep(.el-select), .form-grid :deep(.el-input-number) { width: 100%; }
.field-hint { display: block; margin-top: 4px; color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }
p.field-hint { margin: 0; }
@media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
</style>
