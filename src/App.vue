<template>
  <el-config-provider :locale="elementLocale">
    <router-view v-slot="{ Component, route }">
      <!-- Remount the canvas editor when switching canvases (e.g. "New canvas" from inside the editor). -->
      <component :is="Component" :key="route.name === 'canvas-editor' ? `canvas:${route.params.canvasId}` : undefined" />
    </router-view>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const elementLocale = computed(() => (app.locale === 'zh-CN' ? zhCn : en))
</script>
