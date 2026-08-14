import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'

type MockState = {
  issueRequests: Array<Record<string, unknown>>
}

test.use({
  launchOptions: {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  },
})

async function mockBackend(page: Page): Promise<MockState> {
  const state: MockState = { issueRequests: [] }
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'redeem-code-generator-e2e-token')
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
      body: JSON.stringify({ code: 200, message: 'success', data }),
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
      return success({ availablePoints: 2_000, hasSignedInToday: false, todaySignInPoints: 0 })
    }
    if (path === '/api/points/recharge/admin/codes' && request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>
      state.issueRequests.push(payload)
      const count = Number(payload.count)
      const codes = Array.from({ length: count }, (_, index) => `JAI-E2E${index}-A1B2-C3D4-E5F6-A7B8-C9D${index}`)
      return success({ packageCode: null, points: payload.points, codes })
    }
    if (path.includes('/point-details')) {
      return success({ items: [], total: 0, pageIndex: 1, pageSize: 10 })
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
  const inputs = page.locator('.generator-form .el-input-number input')
  await inputs.nth(0).fill('500')
  await inputs.nth(1).fill('3')
  await page.getByRole('button', { name: '批量生成' }).click()
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

  await page.getByRole('link', { name: '积分定价' }).click()
  await expect(page.getByText('离开并清除结果？')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page).toHaveURL(/\/admin\/redeem-codes$/)

  await page.getByRole('button', { name: '复制全部' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __copiedText?: string }).__copiedText || '')).toContain('JAI-E2E0')
  await page.getByRole('link', { name: '积分定价' }).click()
  await expect(page).toHaveURL(/\/pricing$/)
})

test('mobile generator stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page)
  await openGenerator(page)
  await generateThreeCodes(page)

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/redeem-code-generator-mobile.png', fullPage: true })
})
