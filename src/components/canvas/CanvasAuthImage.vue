<template>
  <div class="canvas-auth-image" :class="{ 'is-error': failed }">
    <img v-if="url" :src="url" :alt="alt" draggable="false" @load="emit('loaded', $event)" />
    <div v-else-if="failed" class="canvas-auth-image-state">
      <el-icon><Picture /></el-icon>
      <span>{{ errorText }}</span>
    </div>
    <div v-else class="canvas-auth-image-state">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, Picture } from '@element-plus/icons-vue'
import { useAuthenticatedImageUrl } from '@/composables/useAuthenticatedImageUrls'

const props = defineProps<{ src: string; alt?: string; errorText?: string }>()
const emit = defineEmits<{ loaded: [event: Event] }>()
const { url, error } = useAuthenticatedImageUrl(() => props.src)
const failed = computed(() => Boolean(error.value))
</script>

<style scoped>
.canvas-auth-image {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--color-primary-soft);
}

.canvas-auth-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}

.canvas-auth-image-state {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.canvas-auth-image-state .el-icon {
  font-size: 28px;
}
</style>
