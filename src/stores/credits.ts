import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as creditService from '@/services/credits'
import { useAuthStore } from '@/stores/auth'
import type { CreditRecord, CreditSummary, RechargePackage } from '@/types/credits'

export const useCreditsStore = defineStore('credits', () => {
  const summary = ref<CreditSummary>({ balance: 0, checkedInToday: false, todaySignInPoints: 0 })
  const records = ref<CreditRecord[]>([])
  const total = ref(0)
  const rechargePackages = ref<RechargePackage[]>([])
  const loading = ref(false)
  const signingIn = ref(false)
  const rechargeLoading = ref(false)
  const purchasingPackageCode = ref('')
  const redeeming = ref(false)

  function getUserId() {
    const userId = useAuthStore().user?.id
    if (!userId) throw new Error('User id is required')
    return userId
  }

  async function fetchSummary() {
    summary.value = await creditService.getCreditSummary()
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

  async function fetchRechargePackages() {
    rechargeLoading.value = true
    try {
      rechargePackages.value = await creditService.getRechargePackages()
      return rechargePackages.value
    } finally {
      rechargeLoading.value = false
    }
  }

  async function createRechargeOrder(packageCode: string) {
    purchasingPackageCode.value = packageCode
    try {
      return await creditService.createRechargeOrder(packageCode)
    } finally {
      purchasingPackageCode.value = ''
    }
  }

  async function redeemPointCode(code: string) {
    redeeming.value = true
    try {
      const result = await creditService.redeemPointCode(code)
      summary.value.balance = result.availablePoints
      await Promise.allSettled([fetchSummary(), fetchRecords()])
      return result
    } finally {
      redeeming.value = false
    }
  }

  return {
    summary,
    records,
    total,
    rechargePackages,
    loading,
    signingIn,
    rechargeLoading,
    purchasingPackageCode,
    redeeming,
    fetchSummary,
    fetchRecords,
    fetchRechargePackages,
    createRechargeOrder,
    redeemPointCode,
    signIn,
  }
})
