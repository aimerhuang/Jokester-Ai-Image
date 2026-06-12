<template>
  <el-button class="soft-button" plain @click="app.toggleLocale()">{{ app.t('common.language') }}</el-button>
</template>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>
