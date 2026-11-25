<template>
  <el-select
    ref="selectRef"
    class="model-picker"
    :class="{ compact }"
    :model-value="modelValue"
    :loading="loading"
    :placeholder="placeholder"
    :teleported="teleported"
    popper-class="model-picker-popper"
    @update:model-value="select"
  >
    <template #label>
      <span class="model-picker-trigger">
        <ModelIcon :provider="selected?.provider" :code="selected?.value || modelValue" :small="compact" />
        <span class="model-picker-name">{{ selected ? displayName(selected) : modelValue }}</span>
      </span>
    </template>

    <el-option-group v-for="group in groups" :key="group.key" :label="group.label">
      <el-option
        v-for="model in group.models"
        :key="model.value"
        :label="displayName(model)"
        :value="model.value"
        :disabled="isLocked(model)"
      >
        <div class="model-option" :class="{ locked: isLocked(model) }" @click="isLocked(model) && openGuide(model)">
          <ModelIcon :provider="model.provider" :code="model.value" />
          <span class="model-copy">
            <span class="model-name">{{ displayName(model) }}</span>
            <span v-if="describe(model)" class="model-description">{{ describe(model) }}</span>
          </span>
          <el-icon v-if="isLocked(model)" class="model-lock"><Lock /></el-icon>
        </div>
      </el-option>
    </el-option-group>
  </el-select>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Lock } from '@element-plus/icons-vue'
import type { ElSelect } from 'element-plus'
import ModelIcon from '@/components/images/ModelIcon.vue'
import { useAppStore } from '@/stores/app'
import { getModelDescriptionKey, isVipOnlyModel } from '@/utils/modelPresentation'
import type { ImageParameterOption } from '@/types/image'

const props = withDefaults(defineProps<{
  modelValue: string
  models: ImageParameterOption[]
  loading?: boolean
  placeholder?: string
  teleported?: boolean
  compact?: boolean
}>(), { loading: false, placeholder: '', teleported: true, compact: false })

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** A non-VIP user picked a VIP-only model: the selection is kept and the caller offers the monthly pass. */
  locked: [value: string]
}>()

const app = useAppStore()
const selectRef = ref<InstanceType<typeof ElSelect>>()
const selected = computed(() => props.models.find((model) => model.value === props.modelValue))

const groups = computed(() => {
  const vip = props.models.filter(isVipOnlyModel)
  const others = props.models.filter((model) => !isVipOnlyModel(model))
  if (!vip.length) return [{ key: 'all', label: '', models: others }]
  const vipLabel = vip.some(isLocked) ? `${app.t('modelPicker.vipGroup')} · ${app.t('modelPicker.vipGroupLocked')}` : app.t('modelPicker.vipGroup')
  return [
    { key: 'vip', label: vipLabel, models: vip },
    ...(others.length ? [{ key: 'recommended', label: app.t('modelPicker.recommendedGroup'), models: others }] : []),
  ]
})

function isLocked(model: ImageParameterOption) {
  return model.access?.available === false
}

function displayName(model: ImageParameterOption) {
  return model.name || model.label || model.value
}

function describe(model: ImageParameterOption) {
  const key = getModelDescriptionKey(model)
  return key ? app.t(key) : ''
}

function select(value: string) {
  const model = props.models.find((item) => item.value === value)
  if (model && isLocked(model)) return openGuide(model)
  emit('update:modelValue', value)
}

function openGuide(model: ImageParameterOption) {
  selectRef.value?.blur()
  emit('locked', model.value)
}
</script>

<style scoped>
.model-picker { width: 100%; }
.model-picker :deep(.el-select__wrapper) { min-height: 50px; padding: 7px 14px; border-radius: 14px; }
.model-picker.compact :deep(.el-select__wrapper) { min-height: 32px; padding: 2px 10px; border-radius: 10px; }
.model-picker-trigger { display: inline-flex; align-items: center; gap: 10px; min-width: 0; max-width: 100%; }
.model-picker-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; color: var(--color-text); }
.compact .model-picker-trigger { gap: 6px; }
.compact .model-picker-name { font-size: 13px; font-weight: 600; }
</style>

<style>
/* The dropdown renders outside this component's scoped tree, so these rules are global but namespaced. */
.model-picker-popper { min-width: 320px; }
.model-picker-popper .el-select-group__title { padding: 12px 16px 6px; font-size: 13px; font-weight: 700; color: var(--color-text); line-height: 1.4; }
.model-picker-popper .el-select-group__split { display: none; }
.model-picker-popper .el-select-dropdown__item { height: auto; padding: 0 8px; line-height: 1.35; }
.model-picker-popper .el-select-dropdown__item.is-disabled { cursor: not-allowed; }
.model-picker-popper .model-option { display: flex; align-items: center; gap: 12px; padding: 9px 8px; border-radius: 10px; }
.model-picker-popper .model-option.locked { opacity: .45; filter: grayscale(1); cursor: not-allowed; }
.model-picker-popper .model-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
.model-picker-popper .model-name { font-weight: 700; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-picker-popper .model-description { font-size: 12px; font-weight: 400; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-picker-popper .model-lock { color: var(--color-text-muted); }
.model-picker-popper .el-select-dropdown__item.is-selected .model-name { color: var(--color-primary); }
</style>
