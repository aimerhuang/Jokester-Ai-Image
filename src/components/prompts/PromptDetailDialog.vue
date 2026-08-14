<template>
  <el-dialog
    v-model="visible"
    class="prompt-detail-dialog"
    :title="prompt?.title || app.t('promptLibrary.detailTitle')"
    width="min(980px, calc(100vw - 32px))"
    destroy-on-close
    append-to-body
  >
    <div v-if="loading" class="detail-loading">
      <el-skeleton animated>
        <template #template>
          <div class="detail-grid">
            <el-skeleton-item variant="image" class="image-skeleton" />
            <div class="detail-copy">
              <el-skeleton-item variant="h3" style="width: 55%" />
              <el-skeleton-item v-for="index in 7" :key="index" variant="text" />
            </div>
          </div>
        </template>
      </el-skeleton>
    </div>

    <el-result
      v-else-if="error"
      icon="error"
      :title="app.t('promptLibrary.detailLoadFailed')"
      :sub-title="error"
    >
      <template #extra>
        <el-button type="primary" :icon="Refresh" @click="$emit('retry')">{{ app.t('common.retry') }}</el-button>
      </template>
    </el-result>

    <div v-else-if="prompt" class="detail-grid">
      <section class="visual-column">
        <div class="cover-shell" :class="{ 'is-placeholder': !imageUrl || imageFailed }">
          <el-image
            v-if="imageUrl && !imageFailed"
            class="cover-image"
            :key="imageUrl"
            :src="imageUrl"
            :alt="prompt.title"
            :preview-src-list="[imageUrl]"
            fit="contain"
            preview-teleported
            hide-on-click-modal
            @error="handleImageError"
          />
          <div v-else class="image-placeholder" role="img" :aria-label="app.t('promptLibrary.imageUnavailable')">
            <el-icon><Picture /></el-icon>
            <span>{{ app.t('promptLibrary.imageUnavailable') }}</span>
          </div>
        </div>

        <dl class="metadata">
          <div>
            <dt>{{ app.t('promptLibrary.itemNumber') }}</dt>
            <dd>No. {{ prompt.externalNo }}</dd>
          </div>
          <div v-if="prompt.authorName">
            <dt>{{ app.t('promptLibrary.author') }}</dt>
            <dd>{{ prompt.authorName }}</dd>
          </div>
          <div v-if="prompt.language">
            <dt>{{ app.t('promptLibrary.language') }}</dt>
            <dd>{{ prompt.language }}</dd>
          </div>
        </dl>

        <p class="attribution">{{ app.t('promptLibrary.attribution') }}</p>
      </section>

      <section class="content-column">
        <p v-if="prompt.description" class="description">{{ prompt.description }}</p>
        <div class="prompt-heading">
          <h3>{{ app.t('promptLibrary.fullPrompt') }}</h3>
          <span>{{ prompt.promptText.length }} {{ app.t('promptLibrary.characters') }}</span>
        </div>
        <pre class="prompt-text">{{ prompt.promptText }}</pre>
      </section>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">{{ app.t('common.cancel') }}</el-button>
        <el-button
          :icon="CopyDocument"
          :loading="action === 'copy'"
          :disabled="!prompt || Boolean(action)"
          @click="prompt && $emit('copy', prompt)"
        >
          {{ app.t('promptLibrary.copyPrompt') }}
        </el-button>
        <el-button
          type="primary"
          :icon="MagicStick"
          :loading="action === 'use'"
          :disabled="!prompt || Boolean(action)"
          @click="prompt && $emit('use', prompt)"
        >
          {{ app.t('promptLibrary.usePrompt') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { CopyDocument, MagicStick, Picture, Refresh } from '@element-plus/icons-vue'
import { usePromptImage } from '@/composables/usePromptImage'
import { useAppStore } from '@/stores/app'
import type { PromptLibraryDetail } from '@/types/prompt'

const props = defineProps<{
  modelValue: boolean
  prompt: PromptLibraryDetail | null
  loading?: boolean
  error?: string
  action?: 'copy' | 'use' | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  copy: [prompt: PromptLibraryDetail]
  use: [prompt: PromptLibraryDetail]
  retry: []
}>()

const app = useAppStore()
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
const { imageUrl, imageFailed, handleImageError, reset: resetImage } = usePromptImage(() => props.prompt?.coverImageUrl)

watch(() => props.prompt?.id, () => {
  resetImage()
})
</script>

<style scoped>
.detail-loading { min-height: 480px; }
.detail-grid { display: grid; grid-template-columns: minmax(280px, .9fr) minmax(0, 1.25fr); gap: 28px; min-width: 0; }
.visual-column, .content-column { min-width: 0; }
.image-skeleton, .cover-shell { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: var(--radius-sm); }
.cover-shell { overflow: hidden; background: var(--color-primary-soft); border: 1px solid var(--color-border); }
.cover-image { display: block; width: 100%; height: 100%; cursor: zoom-in; }
.image-placeholder { width: 100%; height: 100%; display: grid; place-items: center; align-content: center; gap: 10px; color: var(--color-text-muted); background: var(--color-primary-soft); }
.image-placeholder .el-icon { font-size: 36px; color: var(--color-primary); }
.image-placeholder span { font-size: 13px; }
.metadata { display: grid; gap: 0; margin: 16px 0 0; border-top: 1px solid var(--color-border); }
.metadata > div { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.metadata dt { color: var(--color-text-muted); font-size: 13px; }
.metadata dd { margin: 0; max-width: 70%; text-align: right; overflow-wrap: anywhere; font-weight: 600; }
.attribution { margin: 14px 0 0; color: var(--color-text-muted); font-size: 12px; line-height: 1.6; }
.description { margin: 0 0 20px; color: var(--color-text-muted); line-height: 1.7; overflow-wrap: anywhere; }
.prompt-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
.prompt-heading h3 { margin: 0; font-size: 16px; }
.prompt-heading span { color: var(--color-text-muted); font-size: 12px; white-space: nowrap; }
.prompt-text { max-height: 430px; margin: 0; padding: 18px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-bg) 74%, var(--color-surface)); color: var(--color-text); font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 13px; line-height: 1.7; letter-spacing: 0; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 10px; }

@media (max-width: 760px) {
  .detail-grid { grid-template-columns: 1fr; gap: 22px; }
  .detail-loading { min-height: 620px; }
  .prompt-text { max-height: 42vh; }
}

@media (max-width: 480px) {
  .dialog-footer { display: grid; grid-template-columns: 1fr 1fr; }
  .dialog-footer .el-button { min-width: 0; margin-left: 0; }
  .dialog-footer .el-button:first-child { grid-column: 1 / -1; }
}
</style>

<style>
.prompt-detail-dialog .el-dialog__body { padding-top: 10px; }
@media (max-width: 480px) {
  .prompt-detail-dialog { margin-top: 16px !important; margin-bottom: 16px !important; }
  .prompt-detail-dialog .el-dialog__header, .prompt-detail-dialog .el-dialog__body, .prompt-detail-dialog .el-dialog__footer { padding-left: 16px; padding-right: 16px; }
}
</style>
