<template>
  <section class="preview page-card">
    <h2>{{ title }}</h2>
    <div v-if="loading" class="loading-box">{{ loadingText }}</div>
    <img v-else-if="imageUrl" :src="imageUrl" alt="Generated image" />
    <EmptyState v-else :title="emptyTitle" :description="emptyDescription" />
    <div v-if="imageUrl" class="actions"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'

defineProps<{ title: string; loadingText: string; emptyTitle: string; emptyDescription: string; imageUrl?: string; loading?: boolean }>()
</script>

<style scoped>
.preview { padding: 24px; min-height: 560px; display: flex; flex-direction: column; gap: 18px; }
h2 { margin: 0; font-size: 22px; }
img { width: 100%; max-height: 680px; object-fit: contain; border-radius: var(--radius-lg); background: var(--color-primary-soft); }
.loading-box { flex: 1; min-height: 360px; display: grid; place-items: center; border-radius: var(--radius-xl); background: linear-gradient(90deg, var(--color-primary-soft), var(--color-surface), var(--color-primary-soft)); background-size: 220% 100%; animation: shimmer 1.4s infinite; color: var(--color-text-muted); font-weight: 700; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
@keyframes shimmer { to { background-position: -220% 0; } }
</style>
