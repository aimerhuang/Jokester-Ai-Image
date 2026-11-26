<template>
  <el-button class="notice-bell" circle plain :icon="Bell" :aria-label="label" :title="label" @click="$emit('open')">
    <span v-if="unread" class="unread-dot" aria-hidden="true" />
  </el-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
const props = defineProps<{ unread: boolean }>()
defineEmits<{ open: [] }>()
const app = useAppStore()
const label = computed(() => app.t(props.unread ? 'notices.unreadLabel' : 'notices.title'))
</script>

<style scoped>
.notice-bell { position: relative; flex: none; margin-left: 0; }
.notice-bell :deep(.el-icon + span) { margin: 0; }
.unread-dot { position: absolute; top: 3px; right: 3px; width: 8px; height: 8px; background: var(--color-status-down); border: 1px solid var(--color-surface); border-radius: 50%; }
</style>
