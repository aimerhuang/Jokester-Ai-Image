import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as creditService from '@/services/credits'
import type {
  CreditRecord,
  CreditSummary,
  PointPackageCode,
  RechargePackage,
  RechargePlatform,
} from '@/types/credits'

function emptySummary(): CreditSummary {
  return {
    balance: 0,
    permanentPoints: 0,
    expiringPoints: 0,
    nextExpiringPoints: 0,
    nextExpireAt: null,
    checkedInToday: false,
    todaySignInPoints: 0,
  }
}

export const useCreditsStore = defineStore('credits', () => {
  const summary = ref<CreditSummary>(emptySummary())
  const records = ref<CreditRecord[]>([])
  const total = ref(0)
  const rechargePackages = ref<RechargePackage[]>([])
  const summaryLoaded = ref(false)
  const ownerUserId = ref<number | null>(null)
  const loading = ref(false)
  const signingIn = ref(false)
  const rechargeLoading = ref(false)
  const purchasingPackageCode = ref('')
  const redeeming = ref(false)
  let generation = 0
  let summaryRequestId = 0
  let recordsRequestId = 0
  let packagesRequestId = 0
  let signInRequestId = 0
  let orderRequestId = 0
  let redeemRequestId = 0
  let recordsPageIndex = 1
  let recordsPageSize = 20
  let activeSummaryRequest: { generation: number; promise: Promise<CreditSummary> } | null = null

  function requestInvalidatedError() {
    const error = new Error('Credit request was invalidated because the active session changed')
    error.name = 'CreditRequestInvalidatedError'
    return error
  }

  function assertActive(requestGeneration: number) {
    if (requestGeneration !== generation) throw requestInvalidatedError()
  }

  function assertLatest(requestGeneration: number, requestId: number, latestRequestId: number) {
    assertActive(requestGeneration)
    if (requestId !== latestRequestId) throw requestInvalidatedError()
  }

  function activateForUser(userId: number | null, pointBalance?: number | null) {
    const snapshotBalance = typeof pointBalance === 'number' && Number.isFinite(pointBalance)
      ? pointBalance
      : 0
    if (ownerUserId.value === userId) {
      if (!summaryLoaded.value && userId !== null && typeof pointBalance === 'number') {
        summary.value.balance = snapshotBalance
      }
      return
    }
    generation += 1
    ownerUserId.value = userId
    summary.value = emptySummary()
    if (userId !== null) summary.value.balance = snapshotBalance
    records.value = []
    total.value = 0
    rechargePackages.value = []
    summaryLoaded.value = false
    loading.value = false
    signingIn.value = false
    rechargeLoading.value = false
    purchasingPackageCode.value = ''
    redeeming.value = false
    activeSummaryRequest = null
    recordsPageIndex = 1
    recordsPageSize = 20
  }

  function fetchSummary() {
    return loadSummary(false)
  }

  function loadSummary(force: boolean) {
    const requestGeneration = generation
    if (!force && activeSummaryRequest?.generation === requestGeneration) {
      return activeSummaryRequest.promise
    }

    const requestId = ++summaryRequestId
    const request = creditService.getCreditSummary()
      .then((result) => {
        assertActive(requestGeneration)
        if (requestId === summaryRequestId) {
          summary.value = result
          summaryLoaded.value = true
        }
        return result
      })
      .catch((error) => {
        assertActive(requestGeneration)
        throw error
      })
      .finally(() => {
        if (activeSummaryRequest?.promise === request) activeSummaryRequest = null
      })
    activeSummaryRequest = { generation: requestGeneration, promise: request }
    return request
  }

  async function fetchRecords(pageIndex = 1, pageSize = 20) {
    const requestGeneration = generation
    const requestId = ++recordsRequestId
    loading.value = true
    try {
      const result = await creditService.getCreditRecords({ pageIndex, pageSize })
      assertActive(requestGeneration)
      if (requestId === recordsRequestId) {
        records.value = result.items
        total.value = result.total
        recordsPageIndex = pageIndex
        recordsPageSize = pageSize
      }
      return result
    } catch (error) {
      assertActive(requestGeneration)
      throw error
    } finally {
      if (requestGeneration === generation && requestId === recordsRequestId) loading.value = false
    }
  }

  async function signIn() {
    const requestGeneration = generation
    const requestId = ++signInRequestId
    signingIn.value = true
    try {
      const result = await creditService.signIn()
      assertLatest(requestGeneration, requestId, signInRequestId)
      summary.value.balance = result.availablePoints
      summary.value.checkedInToday = true
      summary.value.todaySignInPoints = result.points
      return result
    } finally {
      if (requestGeneration === generation && requestId === signInRequestId) {
        await Promise.allSettled([loadSummary(true), fetchRecords(recordsPageIndex, recordsPageSize)])
        if (requestGeneration === generation && requestId === signInRequestId) signingIn.value = false
      }
      assertLatest(requestGeneration, requestId, signInRequestId)
    }
  }

  async function fetchRechargePackages(platform: RechargePlatform = 'web') {
    const requestGeneration = generation
    const requestId = ++packagesRequestId
    rechargeLoading.value = true
    try {
      const result = await creditService.getRechargePackages(platform)
      assertActive(requestGeneration)
      if (requestId === packagesRequestId) rechargePackages.value = result
      return result
    } catch (error) {
      assertActive(requestGeneration)
      throw error
    } finally {
      if (requestGeneration === generation && requestId === packagesRequestId) rechargeLoading.value = false
    }
  }

  async function createRechargeOrder(packageCode: PointPackageCode) {
    const requestGeneration = generation
    const requestId = ++orderRequestId
    purchasingPackageCode.value = packageCode
    try {
      const result = await creditService.createRechargeOrder(packageCode)
      assertLatest(requestGeneration, requestId, orderRequestId)
      return result
    } catch (error) {
      assertLatest(requestGeneration, requestId, orderRequestId)
      throw error
    } finally {
      if (requestGeneration === generation && requestId === orderRequestId) purchasingPackageCode.value = ''
    }
  }

  async function redeemPointCode(code: string) {
    const requestGeneration = generation
    const requestId = ++redeemRequestId
    redeeming.value = true
    try {
      const result = await creditService.redeemPointCode(code)
      assertLatest(requestGeneration, requestId, redeemRequestId)
      summary.value.balance = result.availablePoints
      return result
    } finally {
      if (requestGeneration === generation && requestId === redeemRequestId) {
        await Promise.allSettled([loadSummary(true), fetchRecords(recordsPageIndex, recordsPageSize), fetchRechargePackages()])
        if (requestGeneration === generation && requestId === redeemRequestId) redeeming.value = false
      }
      assertLatest(requestGeneration, requestId, redeemRequestId)
    }
  }

  return {
    summary,
    records,
    total,
    rechargePackages,
    summaryLoaded,
    ownerUserId,
    loading,
    signingIn,
    rechargeLoading,
    purchasingPackageCode,
    redeeming,
    activateForUser,
    fetchSummary,
    fetchRecords,
    fetchRechargePackages,
    createRechargeOrder,
    redeemPointCode,
    signIn,
  }
})
