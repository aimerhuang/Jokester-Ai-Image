<template>
  <article class="prompt-card" :aria-labelledby="titleId">
    <button
      class="prompt-card__open-target"
      type="button"
      :aria-labelledby="titleId"
      :aria-describedby="`${descriptionId} ${previewId}`"
      @click="openPrompt"
    />

    <div class="prompt-card__cover">
      <img
        v-if="imageUrl && !imageFailed"
        :key="imageUrl"
        :src="imageUrl"
        :alt="item.title"
        loading="lazy"
        decoding="async"
        @error="handleImageError"
      />
      <div v-else class="prompt-card__placeholder" role="img" :aria-label="app.t('promptLibrary.imageUnavailable')">
        <el-icon aria-hidden="true"><Picture /></el-icon>
        <span>{{ app.t('promptLibrary.imageUnavailable') }}</span>
      </div>
    </div>

    <div class="prompt-card__content">
      <h3 :id="titleId">{{ item.title }}</h3>
      <p :id="descriptionId" class="prompt-card__description">{{ item.description }}</p>
      <p :id="previewId" class="prompt-card__preview">{{ item.promptPreview }}</p>
    </div>

    <div class="prompt-card__actions" role="group" :aria-label="item.title">
      <el-button :icon="View" @click.stop="openPrompt">{{ app.t('promptLibrary.openDetail') }}</el-button>
      <el-tooltip :content="app.t('promptLibrary.copyPrompt')" placement="top">
        <el-button
          class="copy-action"
          :icon="CopyDocument"
          :aria-label="app.t('promptLibrary.copyPrompt')"
          :loading="busyAction === 'copy'"
          :disabled="busy"
          @click.stop="copyPrompt"
        />
      </el-tooltip>
      <el-button type="primary" :icon="MagicStick" :loading="busyAction === 'use'" :disabled="busy" @click.stop="usePrompt">
        {{ app.t('promptLibrary.usePrompt') }}
      </el-button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { CopyDocument, MagicStick, Picture, View } from '@element-plus/icons-vue'
import { usePromptImage } from '@/composables/usePromptImage'
import { useAppStore } from '@/stores/app'
import type { PromptLibraryListItem } from '@/types/prompt'

const props = defineProps<{
  item: PromptLibraryListItem
  busyAction?: 'copy' | 'use' | null
}>()

const emit = defineEmits<{
  open: [item: PromptLibraryListItem]
  copy: [item: PromptLibraryListItem]
  use: [item: PromptLibraryListItem]
}>()

const componentId = useId()
const app = useAppStore()
const titleId = `${componentId}-title`
const descriptionId = `${componentId}-description`
const previewId = `${componentId}-preview`
const { imageUrl, imageFailed, handleImageError } = usePromptImage(() => props.item.coverImageUrl)
const busy = computed(() => Boolean(props.busyAction))

function openPrompt() {
  emit('open', props.item)
}

function copyPrompt() {
  if (!busy.value) emit('copy', props.item)
}

function usePrompt() {
  if (!busy.value) emit('use', props.item)
}
</script>

<style scoped>
.prompt-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.prompt-card:hover,
.prompt-card:focus-within {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border));
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-2px);
}

.prompt-card__open-target {
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: transparent;
  cursor: pointer;
}

.prompt-card__open-target:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-primary) 58%, transparent);
  outline-offset: -3px;
}

.prompt-card__cover {
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: var(--color-primary-soft);
}

.prompt-card__cover img,
.prompt-card__placeholder {
  display: block;
  width: 100%;
  height: 100%;
}

.prompt-card__cover img {
  object-fit: cover;
}

.prompt-card__placeholder {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-sm);
  color: var(--color-text-muted);
  background: var(--color-primary-soft);
}

.prompt-card__placeholder :deep(.el-icon) {
  font-size: 30px;
}

.prompt-card__placeholder span {
  font-size: 13px;
  font-weight: 600;
}

.prompt-card__content {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
}

.prompt-card__content h3,
.prompt-card__content p {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.prompt-card__content h3 {
  overflow: hidden;
  display: -webkit-box;
  color: var(--color-text);
  font-size: 17px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.prompt-card__description {
  overflow: hidden;
  display: -webkit-box;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.prompt-card__preview {
  overflow: hidden;
  display: -webkit-box;
  padding-left: 10px;
  border-left: 3px solid var(--color-primary);
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.prompt-card__actions {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding: 0 var(--space-md) var(--space-md);
}

.prompt-card__actions :deep(.el-button) {
  min-width: 0;
  flex: 1 1 0;
  margin: 0;
  border-radius: var(--radius-sm);
}

.prompt-card__actions :deep(.el-button > span) {
  min-width: 0;
  white-space: nowrap;
}

.prompt-card__actions :deep(.copy-action) {
  width: 40px;
  min-width: 40px;
  flex: 0 0 40px;
  padding: 0;
}

@media (prefers-reduced-motion: reduce) {
  .prompt-card {
    transition: none;
  }

  .prompt-card:hover,
  .prompt-card:focus-within {
    transform: none;
  }
}
</style>
