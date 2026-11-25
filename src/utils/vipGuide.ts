import { ElMessageBox } from 'element-plus'
import type { Router } from 'vue-router'
import { http, noAuthRefreshReplayConfig, getStoredToken } from '@/services/http'
import { useAppStore } from '@/stores/app'

export async function offerVipMonthlyPass(router: Router, modelCode: string, beforeNavigate: () => void | Promise<void>) {
  const app = useAppStore()
  const token = getStoredToken()
  try {
    await ElMessageBox.confirm(app.t('vipPricing.locked'), 'VIP', {
      confirmButtonText: app.t('vipPricing.buy'), cancelButtonText: app.t('common.cancel'),
    })
  } catch { return }
  await beforeNavigate()
  if (!token || token !== getStoredToken()) return
  const failure = await router.push({ name: 'recharge', query: { package: 'monthly' }, hash: '#monthly' })
  if (!failure && modelCode && token === getStoredToken()) {
    void http.post(`/ai/model-pricing-events/vip-guide/${encodeURIComponent(modelCode)}`, null, noAuthRefreshReplayConfig).catch(() => undefined)
  }
}
