import { expect, test, type Page } from 'playwright/test'
import type { Model, Row } from './src/services/adminPricing'

async function backend(page: Page, superAdmin = true) {
  const row: Row = {
    id: 101,
    modelCode: 'gpt-image-2',
    resolutionCode: '1k',
    qualityCode: 'low',
    points: 40,
    vipPoints: 32,
    vipPriceMode: 'follow',
    priceAmount: 0.4,
    status: 1,
    revision: 3,
  }
  const model: Model = {
    modelCode: row.modelCode,
    modelName: 'GPT Image',
    providerProtocol: 'openai-image',
    sizeContractVersion: 'legacy',
    enabledRouteCount: 1,
    accessLevel: 'all',
    vipDiscountPercent: null,
    effectiveDiscountPercent: 80,
    revision: 0,
    prices: [row],
    missingPrices: [{ resolutionCode: '2k', qualityCode: 'low' }],
    releasePrices: [],
  }
  let discount = 80
  const writes: Array<{ path: string; payload: Record<string, any> }> = []
  const state = { writes, conflict: false }
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'qa')
    localStorage.setItem('locale', 'zh-CN')
  })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api', '')
    const ok = (data: unknown) => route.fulfill({ json: { code: 0, data } })
    const fail = (code: string) => route.fulfill({ status: 409, json: { code, message: code } })
    if (path === '/auth/profile') return ok({ id: 1, userName: 'admin', isSuperAdmin: superAdmin, pointBalance: 100 })
    if (path === '/points/balance') return ok({ availablePoints: 100 })
    if (path === '/ai/model-pricing')
      return ok({ defaultVipDiscountPercent: discount, largeChangePercent: 50, models: [model] })
    if (path === '/ai/model-pricing/audits')
      return ok({
        items: [
          {
            id: 1,
            batchId: 'QA-BATCH',
            action: 'system_init',
            targetType: 'price',
            targetId: '101',
            modelCode: model.modelCode,
            operatorUserId: 0,
            reason: '初始化',
            afterJson: '{"vipPoints":32}',
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
      })
    if (!path.startsWith('/ai/model-pricing/')) return ok(null)
    const payload = route.request().postDataJSON()
    writes.push({ path, payload })
    if (state.conflict) {
      state.conflict = false
      return fail('PRICE_REVISION_CONFLICT')
    }
    if (path.endsWith('/batch')) {
      if (payload.items[0].status === 0 && !payload.confirmDisableLastPrice) return fail('PRICE_LAST_ENABLED')
      Object.assign(row, payload.items[0])
      if (row.vipPriceMode === 'follow') row.vipPoints = Math.ceil((row.points * discount) / 100)
      row.revision++
    } else if (path.endsWith('/preview'))
      return ok({
        previewToken: 'pv1',
        modelCount: 1,
        priceCount: 1,
        changes: [{ ...row, oldVipPoints: 32, newVipPoints: 28 }],
        manualPrices: [],
      })
    else if (path.endsWith('/discount')) {
      discount = payload.discountPercent
      model.effectiveDiscountPercent = discount
      row.vipPoints = 28
    } else if (path.endsWith('/access')) {
      model.accessLevel = payload.accessLevel
      model.revision++
    } else if (path.endsWith('/prices')) {
      model.missingPrices = []
      model.prices.push({ ...row, ...payload, id: 102, revision: 0 })
    }
    return ok({ prices: model.prices })
  })
  return state
}
const dialog = (page: Page) => page.getByRole('dialog')
async function confirm(page: Page, reason: string) {
  await dialog(page).getByRole('textbox', { name: '变更原因' }).fill(reason)
  await dialog(page).getByRole('button', { name: '确认保存' }).click()
}

test('超管批量改价预览、调价确认与并发冲突', async ({ page }) => {
  const { writes } = await backend(page)
  await page.goto('/admin/pricing')
  const price = page.getByTestId('price-101')
  await price.getByRole('spinbutton', { name: '标准价' }).fill('80')
  await price.getByRole('spinbutton', { name: '标准价' }).blur()
  await page.getByRole('button', { name: /核对并保存/ }).click()
  await expect(dialog(page)).toContainText('32 → 64')
  await dialog(page).getByText('确认大幅调价').click()
  await confirm(page, '模型调价')
  await expect(dialog(page)).toHaveCount(0)
  expect(writes.at(-1)?.payload).toMatchObject({
    confirmLargeChange: true,
    reason: '模型调价',
    items: [{ id: 101, revision: 3, points: 80 }],
  })
  await price.locator('.el-switch__core').click()
  await page.getByRole('button', { name: /核对并保存/ }).click()
  await confirm(page, '关闭档位')
  await dialog(page).getByText('确认禁用最后启用档').click()
  await confirm(page, '关闭档位')
  await expect(dialog(page)).toHaveCount(0)
  expect(writes.at(-1)?.payload.confirmDisableLastPrice).toBe(true)
})
test('折扣预览确认、模型访问策略、缺价新增及系统审计', async ({ page }) => {
  const state = await backend(page)
  await page.goto('/admin/pricing')
  await page.getByRole('button', { name: '修改', exact: true }).click()
  await dialog(page).getByRole('spinbutton').fill('70')
  await dialog(page).getByRole('button', { name: '预览折扣' }).click()
  await expect(dialog(page)).toContainText('32 → 28')
  await confirm(page, '月卡七折')
  await expect(dialog(page)).toHaveCount(0)
  expect(state.writes.at(-1)?.payload).toMatchObject({ discountPercent: 70, previewToken: 'pv1' })
  await page.locator('header .el-switch__core').click()
  await confirm(page, '模型转会员专属')
  await expect(dialog(page)).toHaveCount(0)
  expect(state.writes.at(-1)?.payload).toMatchObject({ accessLevel: 'vip_only', revision: 0 })
  await page.getByRole('button', { name: '新增价格档' }).click()
  await dialog(page).getByRole('spinbutton').first().fill('40')
  await confirm(page, '新档位')
  await expect(dialog(page)).toHaveCount(0)
  expect(state.writes.at(-1)?.payload).toMatchObject({ resolutionCode: '2k', points: 40 })
  await page.getByRole('button', { name: '变更记录' }).click()
  await expect(dialog(page)).toContainText('QA-BATCH')
  await expect(dialog(page)).toContainText('系统')
})
test('普通用户无法通过直接访问打开定价后台', async ({ page }) => {
  await backend(page, false)
  await page.goto('/admin/pricing')
  await expect(page).not.toHaveURL(/admin\/pricing$/)
  await expect(page.locator('.primary-nav')).not.toContainText('生图定价')
})
test('过期行版本刷新定价并丢弃旧修改', async ({ page }) => {
  const state = await backend(page)
  await page.goto('/admin/pricing')
  const points = page.getByTestId('price-101').getByRole('spinbutton', { name: '标准价' })
  await points.fill('42')
  await points.blur()
  await page.getByRole('button', { name: /核对并保存/ }).click()
  state.conflict = true
  await confirm(page, '并发测试')
  await expect(points).toHaveValue('40')
  await expect(page.getByText(/配置已由他人修改/)).toBeVisible()
})
