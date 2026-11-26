<template>
  <el-dialog v-model="open" :title="config.title" width="min(440px, calc(100vw - 32px))" append-to-body
    :close-on-click-modal="false" :before-close="dismiss" @open="never = false">
    <template #header="{ titleId, titleClass }">
      <div class="dialog-heading"><el-icon class="chat-icon"><ChatDotRound /></el-icon><h2 :id="titleId" :class="titleClass">{{ config.title }}</h2></div>
    </template>
    <p class="description">{{ config.description }}</p>
    <div class="group-card">
      <div><strong>{{ config.groupName }}</strong><span class="number">{{ app.t('notices.groupNumber') }} {{ config.groupNumber }}</span></div>
      <el-button v-if="config.joinUrl" text @click="copyOnly">{{ app.t('notices.copyNumber') }}</el-button>
    </div>
    <el-checkbox v-model="never">{{ app.t('notices.never') }}</el-checkbox>
    <template #footer>
      <el-button @click="dismiss">{{ app.t('notices.later') }}</el-button>
      <el-button type="primary" @click="join">{{ app.t(config.joinUrl ? 'notices.joinNow' : 'notices.copyNumber') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import type { QqGroupConfig } from '@/services/announcements'
import { useAppStore } from '@/stores/app'
import { copyGroupNumber, type QqAction } from '@/utils/noticeStorage'
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ config: QqGroupConfig; preview?: boolean }>()
const emit = defineEmits<{ action: [action: QqAction, version: number] }>()
const app = useAppStore()
const never = ref(false)

function finish(action: QqAction) {
  if (!props.preview && props.config.promptVersion != null) emit('action', action, props.config.promptVersion)
  open.value = false
}
function dismiss() { finish(never.value ? 'never' : 'later') }
function copyOnly() {
  if (props.preview) open.value = false
  else if (props.config.groupNumber) void copyGroupNumber(props.config.groupNumber)
}
function join() {
  if (!props.preview) {
    if (props.config.joinUrl) window.open(props.config.joinUrl, '_blank', 'noopener,noreferrer')
    else if (props.config.groupNumber) void copyGroupNumber(props.config.groupNumber)
  }
  finish('joined')
}
</script>

<style scoped>
.dialog-heading, .group-card { display: flex; gap: 12px; align-items: center; }
.dialog-heading h2, .description { margin: 0; overflow-wrap: anywhere; }
.chat-icon { flex: none; width: 36px; height: 36px; border-radius: 50%; font-size: 22px; color: var(--color-primary-hover); background: var(--color-primary-soft); }
.description { color: var(--color-text-muted); line-height: 1.6; }
.group-card { justify-content: space-between; margin: 16px 0 8px; padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.group-card div { min-width: 0; display: grid; gap: 6px; overflow-wrap: anywhere; }
.group-card strong { color: var(--color-text); }
.number { user-select: text; font-variant-numeric: tabular-nums; }
</style>
