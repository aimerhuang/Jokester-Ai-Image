<template>
  <el-button class="soft-button" plain @click="app.toggleTheme()">{{ app.isDark ? app.t('common.light') : app.t('common.dark') }}</el-button>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>
