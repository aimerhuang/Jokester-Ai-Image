<template>
  <svg class="canvas-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'undo'">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </template>
    <template v-else-if="name === 'redo'">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </template>
    <template v-else-if="name === 'text'">
      <path d="M4 7V4h16v3" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </template>
    <template v-else-if="name === 'upload'">
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </template>
    <template v-else-if="name === 'palette'">
      <path d="M12 21a9 9 0 1 1 9-9c0 2-1.6 3.5-3.6 3.5h-2.2a1.9 1.9 0 0 0-1.4 3.2c.3.4.5.8.5 1.3 0 .6-.6 1-2.3 1z" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="11" r="1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'grid'">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </template>
    <template v-else-if="name === 'eraser'">
      <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </template>
    <template v-else-if="name === 'keyboard'">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12.5h.01M10 12.5h.01M14 12.5h.01M18 12.5h.01M8 16h8" />
    </template>
  </svg>
</template>

<script setup lang="ts">
export type CanvasToolbarIconName = 'undo' | 'redo' | 'text' | 'image' | 'upload' | 'palette' | 'grid' | 'trash' | 'eraser' | 'keyboard'

defineProps<{ name: CanvasToolbarIconName }>()
</script>

<style scoped>
.canvas-toolbar-icon {
  width: 18px;
  height: 18px;
  flex: none;
}
</style>
