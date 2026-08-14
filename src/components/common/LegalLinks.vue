<template>
  <nav class="legal-links" :aria-label="app.t('legal.navigation')">
    <a :href="privacyUrl" target="_blank" rel="noopener noreferrer">{{ app.t('auth.privacyPolicy') }}</a>
    <span aria-hidden="true">|</span>
    <a :href="termsUrl" target="_blank" rel="noopener noreferrer">{{ app.t('auth.termsOfService') }}</a>
  </nav>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'

withDefaults(defineProps<{
  privacyUrl?: string
  termsUrl?: string
}>(), {
  privacyUrl: '/legal/privacy/index.html',
  termsUrl: '/legal/terms/index.html',
})

const app = useAppStore()
</script>

<style scoped>
.legal-links {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

a {
  color: inherit;
  text-decoration: none;
}

a:hover { color: var(--color-primary); text-decoration: underline; }
</style>
