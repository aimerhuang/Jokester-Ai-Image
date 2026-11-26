<template>
  <component :is="clickable ? 'button' : 'article'" :type="clickable ? 'button' : undefined" class="notice-card"
    :class="{ 'is-clickable': clickable, 'has-detail': item.hasDetail && !expanded, expanded }" @click="clickable && $emit('select')">
    <img v-if="item.coverUrl && !coverFailed" class="cover" :src="item.coverUrl" alt="" loading="lazy" @error="coverFailed = true" />
    <span class="card-copy">
      <span class="meta">
        <el-tag v-if="item.isPinned" size="small" effect="plain">{{ app.t('notices.pinned') }}</el-tag>
        <el-tag v-if="item.isImportant" size="small" type="danger" effect="light">{{ app.t('notices.important') }}</el-tag>
        <el-tag size="small" :type="announcementCategoryColors[item.category]">{{ app.t(`notices.categories.${item.category}`) }}</el-tag>
        <el-tag v-if="item.versionLabel" size="small" type="info" effect="plain">{{ item.versionLabel }}</el-tag>
        <time v-if="item.publishedAt" :datetime="item.publishedAt">{{ dayjs(item.publishedAt).format('YYYY-MM-DD') }}</time>
      </span>
      <span class="headline"><strong>{{ item.title }}</strong><small v-if="isNew" class="new-tag">{{ app.t('notices.new') }}</small></span>
      <span class="summary">{{ item.summary }}</span>
      <el-icon v-if="item.hasDetail && !expanded" class="arrow"><ArrowRight /></el-icon>
    </span>
  </component>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { announcementCategoryColors, type AnnouncementItem } from '@/services/announcements'
import { useAppStore } from '@/stores/app'
const props = defineProps<{ item: AnnouncementItem; isNew?: boolean; preview?: boolean; expanded?: boolean }>()
defineEmits<{ select: [] }>()
const app = useAppStore()
const clickable = computed(() => props.item.hasDetail && !props.preview && !props.expanded)
const coverFailed = ref(false)
watch(() => props.item.coverUrl, () => { coverFailed.value = false })
</script>

<style scoped>
.notice-card { display: block; overflow: hidden; width: 100%; padding: 0; text-align: start; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); border-radius: var(--radius-md); font: inherit; }
.is-clickable { cursor: pointer; }
.is-clickable:hover, .is-clickable:focus-visible { border-color: var(--color-primary); }
.cover { display: block; width: 100%; aspect-ratio: 20 / 9; object-fit: cover; }
.card-copy { position: relative; display: grid; gap: 9px; padding: 16px; overflow-wrap: anywhere; }
.meta, .headline { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.meta time { font-size: 12px; color: var(--color-text-muted); margin-inline-start: auto; }
.headline strong, .summary { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.headline strong { font-size: 17px; line-height: 1.35; }
.summary { font-size: 14px; line-height: 1.55; color: var(--color-text-muted); }
.has-detail .summary { padding-right: 18px; }
.arrow { position: absolute; bottom: 16px; right: 12px; color: var(--color-text-muted); }
.new-tag { color: var(--color-primary-hover); font-weight: 700; font-size: 11px; }
.expanded .headline strong, .expanded .summary { display: block; }
</style>
