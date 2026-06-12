import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as creditService from '@/services/credits'
import { useAuthStore } from '@/stores/auth'
import type { CreditRecord, CreditSummary } from '@/types/credits'

export const useCreditsStore = defineStore('credits', () => {
  const summary = ref<CreditSummary>({ balance: 0 })
  const records = ref<CreditRecord[]>([])
  const total = ref(0)
  const loading = ref(false)
  const signingIn = ref(false)

  function getUserId() {
    const userId = useAuthStore().user?.id
    if (!userId) throw new Error('User id is required')
    return userId
  }

  async function fetchSummary() {
    summary.value = await creditService.getCreditSummary(useAuthStore().user?.id)
  }

  async function fetchRecords(pageIndex = 1, pageSize = 10) {
    loading.value = true
    try {
      const result = await creditService.getCreditRecords(getUserId(), { pageIndex, pageSize })
      records.value = result.items
      total.value = result.total
    } finally {
      loading.value = false
    }
  }

  async function signIn() {
    signingIn.value = true
    try {
      summary.value = await creditService.signIn()
      await Promise.allSettled([fetchSummary(), fetchRecords()])
      return summary.value
    } finally {
      signingIn.value = false
    }
  }

  return { summary, records, total, loading, signingIn, fetchSummary, fetchRecords, signIn }
})
