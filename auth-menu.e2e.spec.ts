import { expect, test } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'

test('shows the super-admin entry immediately after login', async ({ page }) => {
  let profileRequests = 0
  await page.setViewportSize({ width: 1280, height: 600 })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const success = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'success', data }),
    })

    if (path === '/api/auth/login') {
      return success({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: '2026-08-12T18:00:00Z',
        user: {
          id: 1,
          userName: 'admin',
          nickName: 'Administrator',
          pointBalance: 2_000,
          isSuperAdmin: false,
        },
        sites: [],
        permissions: [],
      })
    }
    if (path === '/api/auth/profile') {
      profileRequests += 1
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
    return success(null)
  })

  await page.goto(`${baseUrl}/login`)
  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('password')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/\/playground$/)
  await expect(page.getByRole('link', { name: '兑换码生成' })).toBeVisible()
  expect(profileRequests).toBe(1)

  await page.getByRole('link', { name: '积分定价' }).click()
  await expect(page).toHaveURL(/\/pricing$/)
  await expect(page.getByRole('heading', { name: '积分定价', exact: true })).toBeVisible()

  await page.getByRole('link', { name: '兑换码生成' }).click()
  await expect(page).toHaveURL(/\/admin\/redeem-codes$/)
  await expect(page.getByRole('heading', { name: '兑换码生成', exact: true })).toBeVisible()

  await page.getByRole('link', { name: '账号信息' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { name: '账号信息', exact: true })).toBeVisible()
})
