<template>
  <div class="empty-state">
    <div class="empty-state__glow" />
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; description: string }>()
</script>

<style scoped>
.empty-state { position: relative; display: grid; place-items: center; gap: 10px; min-height: 260px; padding: 32px; text-align: center; overflow: hidden; background: color-mix(in srgb, var(--color-primary-soft) 70%, transparent); border: 1px dashed var(--color-border); border-radius: var(--radius-xl); }
.empty-state__glow { width: 108px; height: 108px; border-radius: 50%; background: radial-gradient(circle, rgba(111, 127, 63, 0.28), transparent 68%); }
h3 { margin: 0; font-size: 20px; }
p { max-width: 360px; margin: 0; color: var(--color-text-muted); }
</style>
