<template>
  <div class="page-header">
    <div>
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
h1 { margin: 0; font-size: clamp(28px, 4vw, 40px); line-height: 1.08; }
p { margin: 10px 0 0; color: var(--color-text-muted); }
@media (max-width: 767px) { .page-header { flex-direction: column; } }
</style>
