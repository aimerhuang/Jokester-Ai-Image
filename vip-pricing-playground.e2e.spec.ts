import { expect, test, type Page } from 'playwright/test'

type State = {
  points: number
  rate: number
  vipOnly: boolean
  vip: boolean
  superAdmin: boolean
  nextServerPrice?: number
  requests: number[]
  guides: string[]
  modelCode: string
  modelsRead: number
  revision: number
  nextRevision?: number
}
async function visit(page: Page, options: Partial<State> = {}) {
  const state: State = { points: 40, rate: 80, vipOnly: false, vip: false, superAdmin: false, requests: [], guides: [], modelCode: 'gpt-image-2', modelsRead: 0, revision: 1, ...options }
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'qa')
    localStorage.setItem('locale', 'zh-CN')
  })
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const ok = (data: unknown) => route.fulfill({ json: { code: 0, data } })
    const modelCode = state.modelCode,
      vipPoints = Math.ceil((state.points * state.rate) / 100)
    const price = {
      modelCode,
      resolutionCode: '1k',
      qualityCode: 'med',
      points: state.points,
      vipPoints,
      effectivePoints: state.vip ? vipPoints : state.points,
      pricingTier: state.vip ? 'vip' : 'standard',
      priceAmount: 0.4,
      currency: 'CNY',
      sort: 1,
    }
    const membership = state.vip
      ? { tierCode: 'monthly_vip', status: 'active', expiresAt: '2099-01-01T00:00:00Z' }
      : null
    if (path.endsWith('/auth/profile'))
      return ok({
        id: 7,
        userName: 'qa',
        nickName: 'QA',
        isSuperAdmin: state.superAdmin,
        membership,
        pointBalance: 500,
      })
    if (path.endsWith('/points/balance')) return ok({ availablePoints: 500, permanentPoints: 500, expiringPoints: 0 })
    if (path.includes('/model-pricing-events/vip-guide/')) {
      state.guides.push(`${req.method()} ${path} ${req.headers().authorization}`)
      return route.fulfill({ status: 503, json: { code: 503 } })
    }
    if (path.endsWith('/images/models')) {
      state.modelsRead++
      return ok([
        {
          code: modelCode,
          name: 'Studio',
          sort: 1,
          resolutions: ['1k'],
          qualities: ['med'],
          aspectRatios: ['1:1'],
          capabilities: { supportsQuality: true, supportedImageCounts: [1, 2, 3, 4] },
          access: {
            level: state.vipOnly ? 'vip_only' : 'all',
            available: !state.vipOnly || state.vip || state.superAdmin,
            basis: state.vipOnly && state.vip ? 'vip' : state.vipOnly && state.superAdmin ? 'super_admin' : null,
          },
        },
      ])
    }
    if (path.endsWith('/images/parameters'))
      return ok({
        pricingRevision: state.revision,
        resolutions: [{ code: '1k', name: '1K' }],
        qualities: [{ code: 'med', name: 'Medium' }],
        aspectRatios: [{ code: '1:1', name: '1:1' }],
        pointPrices: [price],
      })
    if (path.endsWith('/images/pricing-options')) {
      if (state.nextRevision) { state.revision = state.nextRevision; state.nextRevision = undefined }
      return route.fulfill({ json: { code: 0, pricingRevision: state.revision, data: [price] } })
    }
    if (path.endsWith('/ai/images') && req.method() === 'POST') {
      state.requests.push(req.postDataJSON().expectedUnitPoints)
      if (state.nextServerPrice) {
        state.points = state.nextServerPrice
        state.nextServerPrice = undefined
        return route.fulfill({
          status: 409,
          json: {
            code: 'PRICE_CHANGED',
            message: '价格已更新',
            details: { effectivePoints: state.points, pricingTier: 'standard' },
          },
        })
      }
      return ok({
        id: 99,
        taskId: 99,
        status: 'succeeded',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0cAAAAASUVORK5CYII=',
      })
    }
    if (path.endsWith('/ai/images')) return ok({ items: [], total: 0, pageIndex: 1, pageSize: 100 })
    if (path.endsWith('/recharge/packages'))
      return ok(
        ['monthly', 'trial', 'basic', 'value'].map((code, i) => ({
          code,
          name: code,
          points: code === 'monthly' ? 5000 : 100,
          priceAmount: 1,
          priceMinorUnits: 100,
          benefits: [],
          purchaseEnabled: true,
          currency: 'CNY',
          sort: i,
        })),
      )
    if (path.endsWith('/recharge/redeem')) {
      state.vip = true
      return ok({
        addedPoints: 5000,
        availablePoints: 5500,
        expiresAt: '2099-01-01T00:00:00Z',
        redeemedAt: new Date().toISOString(),
      })
    }
    return ok(null)
  })
  await page.goto('/playground')
  await expect(page.locator('.cost-hint')).toContainText(/\d/)
  return state
}
async function prep(page: Page) {
  await page.locator('.prompt-textarea textarea').fill('Paint a mountain scene')
  await expect(page.locator('button.generate')).toBeEnabled()
}
async function focus(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

test('改价后重新聚焦读取本人新价并提交，提交前涨价需要二次确认', async ({ page }) => {
  const state = await visit(page)
  await prep(page)
  state.points = 45
  await focus(page)
  await expect(page.locator('.cost-hint')).toContainText('45')
  state.points = 50
  await page.locator('button.generate').click()
  await expect(page.getByText(/单图价格已更新为 50/)).toBeVisible()
  expect(state.requests).toEqual([])
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests).toEqual([50])
})
test('事务内涨价返回409，刷新确认新价后再提交', async ({ page }) => {
  const state = await visit(page)
  await prep(page)
  state.nextServerPrice = 60
  await page.locator('button.generate').click()
  await expect(page.getByText(/单图价格已更新为 60/)).toBeVisible()
  expect(state.requests).toEqual([40])
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests).toEqual([40, 60])
})
test('折扣调整在 VIP 页面更新，普通用户保留标准价', async ({ page, browser }) => {
  const member = await visit(page, { vip: true })
  await expect(page.locator('.cost-hint')).toContainText('32')
  member.rate = 70
  await focus(page)
  await expect(page.locator('.cost-hint')).toContainText('28')
  await expect(page.locator('.cost-hint s')).toHaveText('40')
  const other = await browser.newPage({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173' })
  try {
    const regular = await visit(other)
    regular.rate = 70
    await focus(other)
    await expect(other.locator('.cost-hint')).toContainText('40')
    await expect(other.locator('.cost-hint s')).toHaveCount(0)
  } finally {
    await other.close()
  }
})
test('非 VIP 从专属模型开通月卡，返回后按 VIP 价创建', async ({ page }) => {
  await page.addInitScript(() => {
    const scroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (...args) {
      if (this.id === 'monthly') this.setAttribute('data-reached', 'yes')
      scroll.apply(this, args)
    }
  })
  const state = await visit(page, { vipOnly: true })
  const box = page.locator('.el-message-box')
  if (!(await box.isVisible())) await page.getByRole('button', { name: '开通月卡' }).first().click()
  await box.getByRole('button', { name: '开通月卡' }).click()
  await expect(page).toHaveURL(/recharge\?package=monthly#monthly/ )
  await expect(page.locator('#monthly')).toHaveAttribute('data-reached', 'yes')
  await expect.poll(() => state.guides).toEqual(['POST /api/ai/model-pricing-events/vip-guide/gpt-image-2 Bearer qa'])
  await page.getByRole('button', { name: '积分兑换入口' }).click()
  await page.getByPlaceholder('请输入或粘贴充值卡密').fill('MONTHLY-QA')
  await page.getByRole('button', { name: '确认兑换' }).click()
  await page.getByRole('dialog', { name: '兑换成功' }).getByRole('button', { name: '确认' }).click()
  await page.locator('.close-button').click()
  await expect(page.locator('.cost-hint')).toContainText('32')
  await prep(page)
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests).toEqual([32])
})
test('非会员超管可按本人标准价使用 VIP 模型', async ({ page }) => {
  const state = await visit(page, { superAdmin: true, vipOnly: true })
  await expect(page.getByText('管理员体验，按标准价计费')).toBeVisible()
  await prep(page)
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests).toEqual([40])
})


test('legacy 价格外层版本变化会重新拉取模型目录和价格', async ({ page }) => {
  const state = await visit(page)
  const before = state.modelsRead
  state.nextRevision = 2
  state.points = 44
  await focus(page)
  await expect(page.locator('.cost-hint')).toContainText('44')
  expect(state.modelsRead - before).toBeGreaterThanOrEqual(2)
})

test('提交前所选模型下线时不静默使用替代模型', async ({ page }) => {
  const state = await visit(page)
  await prep(page)
  state.modelCode = 'replacement'
  await page.locator('button.generate').click()
  await expect(page.getByText(/生成参数或登录身份已变化/)).toBeVisible()
  expect(state.requests).toEqual([])
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests).toEqual([40])
})

test('报价刷新期间其他标签更换登录账号会终止提交', async ({ page }) => {
  const state = await visit(page)
  await prep(page)
  await page.route('**/api/ai/images/pricing-options', async (route) => {
    await page.evaluate(() => localStorage.setItem('accessToken', 'another-account'))
    await route.fallback()
  })
  await page.locator('button.generate').click()
  await expect(page.getByText(/生成参数或登录身份已变化/)).toBeVisible()
  expect(state.requests).toEqual([])
})

test('详情从任务快照显示原价、实付折扣和节省积分', async ({ page }) => {
  await visit(page)
  await page.route('**/api/ai/images/123', route => route.fulfill({ json: { code: 0, data: {
    id: 123, status: 'succeeded', modelCode: 'gpt-image-2', prompt: 'sunrise', imageCount: 2,
    pointCost: 20, pricingTier: 'vip', unitPointCost: 10, listUnitPointCost: 12,
  } } }))
  await page.goto('/images/123/edit')
  await expect(page.locator('.params-grid')).toContainText(/VIP.*原价 24.*8.33 折.*节省积分 4/)
})

test('定价公示同时列出标准价、会员价与两类用户折算金额，并在聚焦时刷新', async ({ page }) => {
  const state = await visit(page, { points: 12 })
  await page.route('**/api/points/recharge/packages**', route => route.fulfill({ json: { code: 0, data: [
    { code: 'monthly', name: '月卡', points: 5000, priceAmount: 29.9, priceMinorUnits: 2990, currency: 'CNY', benefits: [], purchaseEnabled: true, sort: 0 },
  ] } }))
  await page.goto('/pricing')
  const card = page.locator('.pricing-card').first()
  await expect(card.locator('h2')).toHaveText('Studio')
  await expect(card.locator('thead')).toContainText(/积分.*普通用户.*月卡用户/)
  const row = card.locator('tbody tr').first()
  await expect(row.locator('.slot')).toHaveText('1K-Medium')
  await expect(row.locator('.list-points')).toHaveText('12')
  await expect(row.locator('.member-points')).toHaveText('10会员价')
  await expect(row.locator('.standard-price')).toHaveText('¥0.40')
  // 10 member points at ¥29.90 / 5000 points = ¥0.0598, rounded down to the cent.
  await expect(row.locator('.monthly')).toHaveText('¥0.05')
  state.points = 20
  await focus(page)
  await expect(row.locator('.list-points')).toHaveText('20')
  await expect(row.locator('.member-points strong')).toHaveText('16')
  await expect(row.locator('.monthly')).toHaveText('¥0.09')
})

test('非 VIP 不能在模型下拉中选择会员模型，点击时引导开通月卡', async ({ page }) => {
  const state = await visit(page, { vipOnly: true })
  await page.route('**/api/ai/images/models', route => route.fulfill({ json: { code: 0, data: [
    { code: 'gpt-image-2.6-sunburst', name: 'Sunburst', provider: 'openai-image', sort: 1, resolutions: ['1k'], qualities: ['med'], aspectRatios: ['1:1'],
      capabilities: { supportsQuality: true, supportedImageCounts: [1] }, access: { level: 'vip_only', available: false, reasonCode: 'VIP_REQUIRED', basis: null } },
    { code: state.modelCode, name: 'Studio', provider: 'openai-image', sort: 2, resolutions: ['1k'], qualities: ['med'], aspectRatios: ['1:1'],
      capabilities: { supportsQuality: true, supportedImageCounts: [1] }, access: { level: 'all', available: true, reasonCode: null, basis: null } },
  ] } }))
  await page.reload()
  const picker = page.locator('.prompt-panel .model-picker')
  await expect(picker).toContainText('Studio')
  await picker.click()
  const popper = page.locator('.model-picker-popper:visible')
  await expect(popper.locator('.el-select-group__title').first()).toHaveText('会员模型 · 开通月卡后可用')
  await expect(popper.locator('.el-select-group__title').nth(1)).toHaveText('推荐模型')
  const locked = popper.locator('.el-select-dropdown__item', { hasText: 'Sunburst' })
  await expect(locked).toHaveClass(/is-disabled/)
  await expect(locked).toContainText('新一代旗舰')
  await locked.locator('.model-option').click()
  await expect(page.locator('.el-message-box')).toContainText('此模型为 VIP 专属')
  await page.locator('.el-message-box').getByRole('button', { name: '取消' }).click()
  await expect(picker).toContainText('Studio')
  await expect(page.locator('.insufficient-notice')).toHaveCount(0)
})

test('提交前本人获得 VIP 优惠时直接按较低报价创建', async ({ page }) => {
  const state = await visit(page)
  await prep(page)
  state.vip = true
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests).toEqual([32])
})
