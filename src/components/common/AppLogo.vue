<template>
  <div class="app-logo">
    <img class="app-logo__mark" src="/logo.png" alt="" aria-hidden="true" />
    <div>
      <strong>{{ app.t('app.name') }}</strong>
      <span>{{ app.t('app.tagline') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>

<style scoped>
.app-logo { display: flex; align-items: center; gap: 12px; min-width: 0; }
.app-logo > div:last-child { min-width: 0; }
.app-logo__mark { width: 42px; height: 42px; flex: 0 0 42px; display: block; object-fit: contain; }
strong, span { display: block; overflow-wrap: anywhere; }
strong { font-size: 16px; }
span { color: var(--color-text-muted); font-size: 12px; margin-top: 2px; line-height: 1.35; }
</style>
