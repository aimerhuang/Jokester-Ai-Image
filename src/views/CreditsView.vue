<template>
  <div>
    <section class="balance-card page-card">
      <div>
        <span>{{ app.t('credits.currentCredits') }}</span>
        <strong>{{ credits.summary.balance }}</strong>
      </div>
      <el-button type="primary" class="soft-button" :loading="credits.signingIn" :disabled="credits.summary.checkedInToday" @click="checkIn">
        {{ credits.summary.checkedInToday ? app.t('credits.checkedInToday') : app.t('credits.checkIn') }}
      </el-button>
    </section>
    <section class="page-card table-card">
      <el-table :data="credits.records" :loading="credits.loading">
        <el-table-column prop="type" :label="app.t('credits.type')" />
        <el-table-column :label="app.t('credits.amount')"><template #default="{ row }"><strong :class="row.amount >= 0 ? 'income' : 'expense'">{{ row.amount > 0 ? '+' : '' }}{{ row.amount }}</strong></template></el-table-column>
        <el-table-column prop="description" :label="app.t('credits.description')" />
        <el-table-column prop="date" :label="app.t('credits.date')" />
        <el-table-column prop="balance" :label="app.t('credits.balance')" />
      </el-table>
      <div v-if="credits.total > pageSize" class="table-pagination">
        <el-pagination
          layout="prev, pager, next"
          :total="credits.total"
          :current-page="pageIndex"
          :page-size="pageSize"
          @current-change="handlePageChange"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { useCreditsStore } from '@/stores/credits'
import type { ApiError } from '@/types/api'

const app = useAppStore()
const credits = useCreditsStore()
const pageIndex = ref(1)
const pageSize = 10

onMounted(() => {
  credits.fetchSummary().catch(() => undefined)
  credits.fetchRecords(pageIndex.value, pageSize).catch(() => undefined)
})

function handlePageChange(page: number) {
  pageIndex.value = page
  credits.fetchRecords(page, pageSize).catch(() => undefined)
}

async function checkIn() {
  try {
    await credits.signIn()
    pageIndex.value = 1
    ElMessage.success(app.t('credits.checkInSuccess'))
  } catch (error) {
    ElMessage.error((error as ApiError).message || app.t('credits.checkInFailed'))
  }
}
</script>

<style scoped>
.balance-card { margin-bottom: 24px; padding: 28px; background: var(--color-primary-soft); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.balance-card span { color: var(--color-text-muted); font-weight: 700; }
.balance-card strong { display: block; margin-top: 8px; font-size: 48px; }
.table-card { padding: 12px; }
.table-pagination { display: flex; justify-content: flex-end; padding: 16px 8px 8px; }
.income { color: var(--color-primary); }
.expense { color: var(--color-warning); }
@media (max-width: 640px) { .balance-card { align-items: stretch; flex-direction: column; } }
</style>
