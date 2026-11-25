<template>
  <span class="model-icon" :class="[family, { small }]" aria-hidden="true">
    <el-icon><component :is="family === 'gemini' ? StarFilled : MagicStick" /></el-icon>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MagicStick, StarFilled } from '@element-plus/icons-vue'

const props = defineProps<{ provider?: string | null; code?: string | null; small?: boolean }>()

const family = computed(() => {
  const text = `${props.provider || ''} ${props.code || ''}`.toLowerCase()
  return text.includes('gemini') || text.includes('nano') ? 'gemini' : 'openai'
})
</script>

<style scoped>
.model-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  font-size: 18px;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-text) 6%, transparent);
}
.model-icon.small { width: 22px; height: 22px; border-radius: 7px; font-size: 13px; }
.model-icon.gemini { color: #4f7cf6; }
</style>
