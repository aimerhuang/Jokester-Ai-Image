import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'

type MockState = {
  availablePoints: number
  balanceRequests: number
  balanceBehavior: 'success' | 'unavailable'
  detailRequests: number
  detailPageIndexes: number[]
  detailsTotal: number
  failNextDetailPage: number | null
  hasSignedInToday: boolean
  orderBehavior: 'success' | 'gateway-timeout'
  orderRequests: Array<Record<string, unknown>>
  redeemRequests: Array<Record<string, unknown>>
  packageRequests: number
  membership: {
    tierCode: string
    status: string
    expiresAt: string
  } | null
}

async function mockPointBackend(page: Page): Promise<MockState> {
  const state: MockState = {
    availablePoints: 1_250,
    balanceRequests: 0,
    balanceBehavior: 'success',
    detailRequests: 0,
    detailPageIndexes: [],
    detailsTotal: 3,
    failNextDetailPage: null,
    hasSignedInToday: true,
    orderBehavior: 'success',
    orderRequests: [],
    redeemRequests: [],
    packageRequests: 0,
    membership: null,
  }

  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'point-package-e2e-token')
    localStorage.setItem('locale', 'zh-CN')
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const success = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    })

    if (path === '/api/auth/profile') {
      return success({
        id: 42,
        userName: 'point-tester',
        nickName: 'Point Tester',
        email: 'point@example.com',
        pointBalance: state.availablePoints,
        isSuperAdmin: false,
        membership: state.membership,
      })
    }
    if (path === '/api/points/balance') {
      state.balanceRequests += 1
      if (state.balanceBehavior === 'unavailable') {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Balance unavailable' }),
        })
      }
      return success({
        availablePoints: state.availablePoints,
        permanentPoints: 900,
        expiringPoints: state.availablePoints - 900,
        nextExpiringPoints: 200,
        nextExpireAt: '2026-09-01T00:00:00Z',
        hasSignedInToday: state.hasSignedInToday,
        todaySignInPoints: 25,
      })
    }
    if (path === '/api/points/details') {
      const pageIndex = Number(url.searchParams.get('pageIndex'))
      state.detailRequests += 1
      state.detailPageIndexes.push(pageIndex)
      expect(url.searchParams.get('pageSize')).toBe('20')
      if (state.failNextDetailPage === pageIndex) {
        state.failNextDetailPage = null
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Details unavailable' }),
        })
      }
      return success({
        items: pageIndex === 1 ? [
          {
            id: 3,
            userId: 42,
            changePoints: 0,
            balanceAfter: state.availablePoints,
            changeType: 'refund_settled',
            source: 'image_refund',
            remark: '原积分批次已到期，余额未增加',
            createdAt: '2026-08-20T08:00:00Z',
          },
          {
            id: 2,
            userId: 42,
            changePoints: 500,
            balanceAfter: state.availablePoints,
            changeType: 'credit',
            source: 'recharge',
            remark: '套餐兑换到账',
            createdAt: '2026-08-19T08:00:00Z',
          },
          {
            id: 1,
            userId: 42,
            changePoints: 0,
            balanceAfter: 750,
            changeType: 'future_adjustment',
            source: 'future_source',
            remark: '未来流水类型',
            createdAt: '2026-08-18T08:00:00Z',
          },
        ] : [],
        total: state.detailsTotal,
        pageIndex,
        pageSize: 20,
      })
    }
    if (path === '/api/points/sign-in' && method === 'POST') {
      state.hasSignedInToday = true
      state.availablePoints += 25
      return success({
        points: 25,
        expireAt: '2026-08-20T15:59:59Z',
        availablePoints: state.availablePoints,
      })
    }
    if (path === '/api/points/recharge/packages') {
      state.packageRequests += 1
      expect(url.searchParams.get('platform')).toBe('web')
      return success([
        packageItem('monthly', '服务端月卡', 4_999, 59, 5_900, 30, false, 1, true),
        packageItem('trial', '服务端体验包', 200, 2, 200, null, false, 2, false, state.redeemRequests.length === 0),
        packageItem('basic', '服务端基础包', 1_000, 20, 2_000, null, true, 3),
        packageItem('value', '服务端超值包', 3_600, 48, 4_800, null, true, 4),
      ])
    }
    if (path === '/api/points/recharge/orders' && method === 'POST') {
      state.orderRequests.push(request.postDataJSON() as Record<string, unknown>)
      if (state.orderBehavior === 'gateway-timeout') {
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'GATEWAY_TIMEOUT', message: 'Gateway timeout', requestId: 'order-timeout' }),
        })
      }
      return success({
        orderNo: 'ORDER-E2E-001',
        packageCode: 'basic',
        points: 1_000,
        priceAmount: 20,
        priceMinorUnits: 2_000,
        currency: 'CNY',
        status: 0,
        purchaseUrl: null,
        expiresAt: '2026-08-21T08:00:00Z',
        createdAt: '2026-08-20T08:00:00Z',
      })
    }
    if (path === '/api/points/recharge/redeem' && method === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>
      state.redeemRequests.push(payload)
      state.availablePoints = 1_750
      state.membership = {
        tierCode: 'monthly_vip',
        status: 'active',
        expiresAt: '2099-09-19T08:00:00Z',
      }
      return success({
        addedPoints: 500,
        availablePoints: state.availablePoints,
        expiresAt: '2026-09-19T08:00:00Z',
        redeemedAt: '2026-08-20T08:00:00Z',
      })
    }

    return success(null)
  })

  return state
}

function packageItem(
  code: string,
  name: string,
  points: number,
  priceAmount: number,
  priceMinorUnits: number,
  validityDays: number | null,
  purchaseEnabled: boolean,
  sort: number,
  isFeatured = false,
  isFirstPurchaseEligible = false,
) {
  return {
    code,
    name,
    description: `${name}说明`,
    points,
    priceAmount,
    priceMinorUnits,
    currency: 'CNY',
    validityDays,
    bonusPercent: 0,
    badgeCode: isFeatured ? 'recommended' : null,
    isFeatured,
    isFirstPurchaseEligible,
    purchaseEnabled,
    benefits: [`${name}权益`],
    sort,
  }
}

test('credit center shows authoritative breakdown and keeps zero-value records', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockPointBackend(page)
  await page.goto(`${baseUrl}/credits`, { waitUntil: 'networkidle' })

  await expect(page.locator('.balance-total')).toHaveText('1,250')
  await expect(page.locator('.balance-breakdown')).toContainText('900')
  await expect(page.locator('.balance-breakdown')).toContainText('350')
  await expect(page.getByText('生图失败结算')).toBeVisible()
  await expect(page.getByText('future_adjustment')).toBeVisible()
  await expect(page.locator('.neutral').first()).toHaveText('0')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})

test('credit center does not present a failed balance request as zero', async ({ page }) => {
  const state = await mockPointBackend(page)
  state.balanceBehavior = 'unavailable'
  await page.goto(`${baseUrl}/credits`, { waitUntil: 'networkidle' })

  await expect(page.getByText('暂时无法读取积分余额，请重试。')).toBeVisible()
  await expect(page.locator('.balance-total')).toHaveCount(0)
  await expect(page.locator('.account-card')).toContainText('1250')
  await expect(page.locator('.recharge-entry')).toContainText('1250')
})

test('failed record pagination keeps the last successful page for sign-in refresh', async ({ page }) => {
  const state = await mockPointBackend(page)
  state.hasSignedInToday = false
  state.detailsTotal = 21
  state.failNextDetailPage = 2
  await page.goto(`${baseUrl}/credits`, { waitUntil: 'networkidle' })

  await page.locator('.el-pager li').filter({ hasText: '2' }).click()
  await expect(page.getByText('积分明细刷新失败，当前显示的是上次成功获取的数据。')).toBeVisible()
  await expect(page.locator('.el-pager li.is-active')).toHaveText('1')

  await page.locator('.balance-card').getByRole('button', { name: '今日签到' }).click()
  await expect(page.locator('.el-message__content')).toContainText('签到成功')
  expect(state.detailPageIndexes.slice(-2)).toEqual([2, 1])
})

test('recharge uses server packages and keeps a no-URL order pending', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await mockPointBackend(page)
  await page.goto(`${baseUrl}/recharge`, { waitUntil: 'networkidle' })

  await expect(page.locator('.plan-card')).toHaveCount(4)
  await expect(page.locator('.plan-card--monthly')).toContainText('服务端月卡')
  await expect(page.locator('.plan-card--monthly .points-row strong')).toHaveText('5,000')
  await expect(page.locator('.plan-card--trial')).toContainText('当前账号符合首次购买资格')
  await expect(page.locator('.plan-card--monthly .buy-button')).toBeDisabled()

  await page.locator('.plan-card--basic .buy-button').click()
  await expect(page.getByText('订单处于待支付状态', { exact: false })).toBeVisible()
  await expect(page.getByText('ORDER-E2E-001')).toBeVisible()
  expect(state.orderRequests).toEqual([{ packageCode: 'basic' }])
  await expect(page.locator('.balance-pill strong')).toHaveText('1,250')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})

test('gateway timeout locks recharge ordering to prevent duplicates', async ({ page }) => {
  const state = await mockPointBackend(page)
  state.orderBehavior = 'gateway-timeout'
  await page.goto(`${baseUrl}/recharge`, { waitUntil: 'networkidle' })

  const buyButton = page.locator('.plan-card--basic .buy-button')
  await buyButton.click()
  await expect(page.locator('.el-message__content')).toContainText('订单创建结果未知')
  await expect(buyButton).toBeDisabled()
  await expect(buyButton).toContainText('结果待核对')
  await buyButton.evaluate((button: HTMLButtonElement) => button.click())
  expect(state.orderRequests).toHaveLength(1)
})

test('redemption preserves case, trims edges, and shows the actual expiry', async ({ page }) => {
  const state = await mockPointBackend(page)
  await page.goto(`${baseUrl}/recharge`, { waitUntil: 'networkidle' })
  const balanceRequestsBeforeRedeem = state.balanceRequests
  const detailRequestsBeforeRedeem = state.detailRequests

  await page.getByRole('button', { name: '积分兑换入口' }).click()
  await page.getByPlaceholder('请输入或粘贴充值卡密').fill('  AbC-123  ')
  await page.getByRole('button', { name: '确认兑换' }).click()

  await expect(page.getByRole('dialog', { name: '兑换成功' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '兑换成功' })).toContainText('+500')
  await expect(page.getByRole('dialog', { name: '兑换成功' })).toContainText('1,750')
  await expect(page.getByRole('dialog', { name: '兑换成功' })).toContainText('本次积分有效至')
  const expectedExpiresAt = await page.evaluate(() => new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date('2026-09-19T08:00:00Z')))
  const expectedRedeemedAt = await page.evaluate(() => new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date('2026-08-20T08:00:00Z')))
  await expect(page.getByRole('dialog', { name: '兑换成功' })).toContainText(expectedExpiresAt)
  await expect(page.getByRole('dialog', { name: '兑换成功' })).toContainText(expectedRedeemedAt)
  const rechargeBadge = page.locator('.recharge-header .monthly-vip-badge')
  await expect(rechargeBadge).toBeVisible()
  await expect(rechargeBadge).toHaveAttribute('aria-label', /月卡 VIP.*有效至/)
  expect(await rechargeBadge.evaluate((element) => getComputedStyle(element, '::after').animationName)).toContain('vip-badge-sweep')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await rechargeBadge.evaluate((element) => getComputedStyle(element, '::after').animationName)).toBe('none')
  expect(await rechargeBadge.locator('.vip-badge__icon').evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  await expect(page.locator('.plan-card--trial')).toContainText('当前账号按后续购买积分到账')
  expect(state.redeemRequests).toEqual([{ code: 'AbC-123' }])
  expect(state.balanceRequests).toBeGreaterThan(balanceRequestsBeforeRedeem)
  expect(state.detailRequests).toBeGreaterThan(detailRequestsBeforeRedeem)
  expect(state.packageRequests).toBeGreaterThanOrEqual(2)

  await page.goto(`${baseUrl}/playground`)
  await expect(page.locator('.account-card .monthly-vip-badge')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.topbar .monthly-vip-badge')).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.locator('.drawer-account .monthly-vip-badge')).toBeVisible()
  await page.getByRole('link', { name: '账号信息' }).click()
  await expect(page.locator('.profile-card .monthly-vip-badge')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})

test('monthly VIP badge expires automatically and ignores non-active membership', async ({ page }) => {
  const state = await mockPointBackend(page)
  state.membership = {
    tierCode: 'monthly_vip',
    status: 'active',
    expiresAt: new Date(Date.now() + 5_000).toISOString(),
  }

  await page.goto(`${baseUrl}/playground`)
  await expect(page.locator('.account-card .monthly-vip-badge')).toBeVisible()
  await expect(page.locator('.monthly-vip-badge')).toHaveCount(0, { timeout: 7_000 })

  state.membership = {
    tierCode: 'monthly_vip',
    status: 'expired',
    expiresAt: '2099-09-19T08:00:00Z',
  }
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.locator('.monthly-vip-badge')).toHaveCount(0)
})
