import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'
const privacyVersion = 'privacy-2026-08-21'
const termsVersion = 'terms-2026-08-21'

async function mockRegistrationBackend(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const success = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    })

    if (path === '/api/auth/register/email-code' && request.method() === 'POST') {
      return success({ retryAfterSeconds: 60 })
    }
    if (path === '/api/auth/register' && request.method() === 'POST') {
      return success({ userId: 42 })
    }

    return success(null)
  })
}

test('publishes the legal pages', async ({ page }) => {
  await page.goto(`${baseUrl}/legal/privacy/index.html`)
  await expect(page.getByRole('heading', { name: 'Jo AI Image 隐私政策' })).toBeVisible()
  await expect(page.getByText(`版本：${privacyVersion}`)).toBeVisible()
  await expect(page.getByText('生效日期：2026 年 8 月 21 日')).toBeVisible()
  await expect(page.getByText('内部草案')).toHaveCount(0)
  await expect(page.locator('.brand__mark')).toHaveAttribute('src', '/logo.png')

  await page.goto(`${baseUrl}/legal/terms/index.html`)
  await expect(page.getByRole('heading', { name: 'Jo AI Image 服务条款' })).toBeVisible()
  await expect(page.getByText(`版本：${termsVersion}`)).toBeVisible()
  await expect(page.getByText('生效日期：2026 年 8 月 21 日')).toBeVisible()

  await page.goto(`${baseUrl}/login`)
  await expect(page.locator('.app-logo strong')).toHaveText('Jo AI Image')
  await expect(page.locator('.app-logo__mark')).toHaveAttribute('src', '/logo.png')
  await expect(page.locator('.auth-form h1')).toHaveText('Jo AI Image')
})

test('registers with email, email code, and password only', async ({ page }) => {
  await mockRegistrationBackend(page)
  const email = 'register@example.com'
  const emailCode = '123456'
  const password = 'Password123'

  await page.goto(`${baseUrl}/register`)
  await expect(page.locator('.auth-form .el-form input')).toHaveCount(3)
  await expect(page.getByLabel('账号', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('昵称', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('确认密码', { exact: true })).toHaveCount(0)
  await expect(page.locator('.legal-consents')).toHaveCount(0)

  await page.getByLabel('邮箱', { exact: true }).fill(email)
  await page.getByLabel('邮箱验证码', { exact: true }).fill(emailCode)
  await page.getByLabel('密码', { exact: true }).fill(password)

  const registerRequestPromise = page.waitForRequest((request) => {
    const path = new URL(request.url()).pathname
    return request.method() === 'POST' && path === '/api/auth/register'
  })
  await page.getByRole('button', { name: '注册', exact: true }).click()

  const registerRequest = await registerRequestPromise
  expect(registerRequest.postDataJSON()).toEqual({ email, emailCode, password })

  await page.getByRole('button', { name: '确认', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('account') === email)
  await expect(page.getByLabel('邮箱或账号', { exact: true })).toHaveValue(email)
})

test('keeps public legal pages and the auth legal footer within the mobile viewport', async ({ page }) => {
  await mockRegistrationBackend(page)
  await page.setViewportSize({ width: 390, height: 844 })

  for (const path of ['/legal/privacy/index.html', '/legal/terms/index.html', '/register']) {
    await page.goto(`${baseUrl}${path}`)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  }

  await expect(page.locator('.auth-layout__legal')).toBeVisible()
})

test('sends a registration email code with the email address only', async ({ page }) => {
  await mockRegistrationBackend(page)
  const email = 'code@example.com'

  await page.goto(`${baseUrl}/register`)
  await expect(page.getByLabel('图片验证码', { exact: true })).toHaveCount(0)
  await page.getByLabel('邮箱', { exact: true }).fill(email)
  const sendButton = page.getByRole('button', { name: '发送验证码', exact: true })
  await expect(sendButton).toBeEnabled()

  const emailCodeRequestPromise = page.waitForRequest((request) => {
    const path = new URL(request.url()).pathname
    return request.method() === 'POST' && path === '/api/auth/register/email-code'
  })
  await sendButton.click()

  const emailCodeRequest = await emailCodeRequestPromise
  expect(emailCodeRequest.postDataJSON()).toEqual({ email })
  await expect(page.getByText('邮箱验证码已发送，请检查收件箱和垃圾邮件。')).toBeVisible()
  await expect(page.getByRole('button', { name: /\d+ 秒后重发/ })).toBeDisabled()
})
