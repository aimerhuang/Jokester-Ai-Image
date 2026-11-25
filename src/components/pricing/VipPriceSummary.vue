<template>
  <span>VIP<template v-if="list != null && paid != null && list > paid && list > 0"> · {{ app.t('vipPricing.original') }} <s>{{ list * count }}</s> · {{ discount }} · {{ app.t('vipPricing.saved') }} {{ (list - paid) * count }}</template></span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

const props = withDefaults(defineProps<{ list?: number | null; paid?: number | null; count?: number }>(), { count: 1 })
const app = useAppStore()
const discount = computed(() => {
  const fraction = props.list && props.paid != null ? props.paid / props.list : 1
  const format = new Intl.NumberFormat(app.locale, { maximumFractionDigits: 2 })
  return app.locale === 'zh-CN' ? `${format.format(fraction * 10)} 折` : `${format.format((1 - fraction) * 100)}% off`
})
</script>
