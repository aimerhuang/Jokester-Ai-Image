import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'

type MockState = {
  issueRequests: Array<Record<string, unknown>>
  issueBehavior: 'success' | 'rate-limit' | 'timeout'
}

async function mockBackend(page: Page): Promise<MockState> {
  const state: MockState = { issueRequests: [], issueBehavior: 'success' }
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'redeem-code-generator-e2e-token')
    localStorage.setItem('locale', 'zh-CN')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Clipboard permission denied')) },
    })
    Object.defineProperty(Document.prototype, 'execCommand', {
      configurable: true,
      value(command: string) {
        if (command !== 'copy') return false
        const active = document.activeElement
        ;(window as typeof window & { __copiedText?: string }).__copiedText = active instanceof HTMLTextAreaElement
          ? active.value
          : ''
        return true
      },
    })
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const success = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    })

    if (path === '/api/auth/profile') {
      return success({
        id: 1,
        userName: 'admin',
        nickName: 'Administrator',
        pointBalance: 2_000,
        isSuperAdmin: true,
      })
    }
    if (path === '/api/points/balance') {
      return success({
        availablePoints: 2_000,
        permanentPoints: 1_500,
        expiringPoints: 500,
        nextExpiringPoints: 500,
        nextExpireAt: '2026-09-01T00:00:00Z',
        hasSignedInToday: false,
        todaySignInPoints: 0,
      })
    }
    if (path === '/api/points/recharge/packages') {
      expect(new URL(request.url()).searchParams.get('platform')).toBe('web')
      return success([
        {
          code: 'monthly',
          name: '特惠月卡',
          description: '服务端月卡说明',
          points: 5_000,
          priceAmount: 59,
          priceMinorUnits: 5_900,
          currency: 'CNY',
          validityDays: 30,
          bonusPercent: 0,
          badgeCode: 'recommended',
          isFeatured: true,
          isFirstPurchaseEligible: false,
          purchaseEnabled: false,
          benefits: ['服务端权益'],
          sort: 1,
        },
        {
          code: 'trial',
          name: '首充体验包',
          points: 200,
          priceAmount: 2,
          priceMinorUnits: 200,
          currency: 'CNY',
          validityDays: null,
          bonusPercent: 0,
          isFeatured: false,
          isFirstPurchaseEligible: true,
          purchaseEnabled: false,
          benefits: [],
          sort: 2,
        },
        {
          code: 'basic',
          name: '服务端基础包',
          points: 1_000,
          priceAmount: 20,
          priceMinorUnits: 2_000,
          currency: 'CNY',
          validityDays: null,
          bonusPercent: 0,
          isFeatured: false,
          isFirstPurchaseEligible: false,
          purchaseEnabled: true,
          benefits: ['基础权益'],
          sort: 3,
        },
        {
          code: 'value',
          name: '服务端超值包',
          points: 3_600,
          priceAmount: 48,
          priceMinorUnits: 4_800,
          currency: 'CNY',
          validityDays: null,
          bonusPercent: 20,
          isFeatured: true,
          isFirstPurchaseEligible: false,
          purchaseEnabled: true,
          benefits: ['超值权益'],
          sort: 4,
        },
      ])
    }
    if (path === '/api/points/recharge/admin/codes' && request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>
      state.issueRequests.push(payload)
      if (state.issueBehavior === 'timeout') return route.abort('timedout')
      if (state.issueBehavior === 'rate-limit') {
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '2' },
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'RATE_LIMITED',
            message: 'rate limited',
            requestId: 'request-rate-limit',
            details: { retryAfterSeconds: 2 },
          }),
        })
      }
      const count = Number(payload.count)
      const codes = Array.from({ length: count }, (_, index) => `JAI-E2E${index}-A1B2-C3D4-E5F6-A7B8-C9D${index}`)
      const packagePoints: Record<string, number> = { monthly: 5_000, trial: 200, basic: 1_000, value: 3_600 }
      const points = payload.packageCode ? packagePoints[String(payload.packageCode)] : Number(payload.points)
      return success({ packageCode: payload.packageCode ?? null, points, codes })
    }
    if (path === '/api/points/details') {
      return success({ items: [], total: 0, pageIndex: 1, pageSize: 20 })
    }
    return success(null)
  })
  return state
}

async function openGenerator(page: Page) {
  await page.goto(`${baseUrl}/admin/redeem-codes`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: '兑换码生成', exact: true })).toBeVisible()
}

async function generateThreeCodes(page: Page) {
  await page.locator('.mode-field .el-segmented__item').filter({ hasText: '自定义积分' }).click()
  const inputs = page.locator('.generator-form .el-input-number input')
  await inputs.nth(0).fill('500')
  await inputs.nth(1).fill('3')
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.generate-button')
    button?.click()
    button?.click()
  })
  await expect(page.locator('.code-row')).toHaveCount(3)
}

test('super administrator generates, protects, and copies a batch', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const state = await mockBackend(page)
  await openGenerator(page)
  await expect(page.getByRole('link', { name: '兑换码生成' })).toBeVisible()
  await generateThreeCodes(page)

  expect(state.issueRequests).toEqual([{ points: 500, count: 3 }])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/redeem-code-generator-desktop.png', fullPage: true })

  await page.getByRole('link', { name: '积分定价' }).evaluate((link: HTMLAnchorElement) => link.click())
  await expect(page.getByText('请先安全保存全部兑换码，并点击“我已安全保存”关闭结果。')).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/redeem-codes$/)

  await page.getByRole('button', { name: '复制全部' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __copiedText?: string }).__copiedText || '')).toContain('JAI-E2E0')
  await page.getByRole('button', { name: '我已安全保存' }).click()
  await expect(page.locator('.issued-result-dialog')).toHaveCount(0)
  await page.getByRole('link', { name: '积分定价' }).click()
  await expect(page).toHaveURL(/\/pricing$/)
})

test('mobile generator stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page)
  await openGenerator(page)
  await generateThreeCodes(page)

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await expect(page.locator('.code-row code').first()).toContainText('JAI-E2E0-A1B2-C3D4-E5F6-A7B8-C9D0')
  await page.screenshot({ path: 'test-results/redeem-code-generator-mobile.png', fullPage: true })
})

test('package mode submits packageCode without custom points and locks order quantity', async ({ page }) => {
  const state = await mockBackend(page)
  await openGenerator(page)

  await page.locator('.package-field .el-select').click()
  await expect(page.getByRole('option', { name: '特惠月卡' })).toBeVisible()
  await expect(page.getByRole('option', { name: '首充体验包' })).toBeVisible()
  await expect(page.getByRole('option', { name: '服务端基础包' })).toBeVisible()
  await page.getByRole('option', { name: '服务端超值包' }).click()
  await page.locator('.order-field input').fill('ORDER-E2E-001')
  await page.locator('.order-field input').blur()
  await expect(page.locator('.count-field input')).toHaveValue('1')
  await expect(page.locator('.count-field input')).toBeDisabled()
  await page.getByRole('button', { name: '批量生成' }).click()
  await expect(page.locator('.code-row')).toHaveCount(1)

  expect(state.issueRequests).toEqual([{ packageCode: 'value', count: 1, orderNo: 'ORDER-E2E-001' }])
})

test('logout clears a one-time result without being blocked by the leave guard', async ({ page }) => {
  await mockBackend(page)
  await openGenerator(page)
  await generateThreeCodes(page)

  await page.getByRole('button', { name: '退出登录' }).evaluate((button: HTMLButtonElement) => button.click())
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('.code-row')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull()
})

test('rate limiting and unknown outcomes prevent duplicate issuing', async ({ page }) => {
  const state = await mockBackend(page)
  await openGenerator(page)
  await page.locator('.mode-field .el-segmented__item').filter({ hasText: '自定义积分' }).click()

  state.issueBehavior = 'rate-limit'
  await page.getByRole('button', { name: '批量生成' }).click()
  await expect(page.getByText(/操作过于频繁/)).toBeVisible()
  await expect(page.locator('.generate-button')).toBeDisabled()
  await page.locator('.generate-button').evaluate((button: HTMLButtonElement) => button.click())
  expect(state.issueRequests).toHaveLength(1)

  await page.reload({ waitUntil: 'networkidle' })
  state.issueBehavior = 'timeout'
  await page.locator('.mode-field .el-segmented__item').filter({ hasText: '自定义积分' }).click()
  await page.getByRole('button', { name: '批量生成' }).click()
  await expect(page.getByText(/签发结果未知/)).toBeVisible()
  await expect(page.getByRole('button', { name: '结果待核对' })).toBeDisabled()
  await page.locator('.generate-button').evaluate((button: HTMLButtonElement) => button.click())
  expect(state.issueRequests).toHaveLength(2)
})
