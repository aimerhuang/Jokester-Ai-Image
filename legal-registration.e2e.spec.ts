import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5176'
const privacyVersion = 'privacy-2026-08-13'
const termsVersion = 'terms-2026-08-13'

test.use({
  launchOptions: {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  },
})

async function mockLegalBackend(page: Page, options: { legalStatus?: number } = {}) {
  const registerRequests: Array<Record<string, unknown>> = []
  const emailCodeRequests: Array<Record<string, unknown>> = []
  let captchaSequence = 0

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const success = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data }),
    })

    if (path === '/api/legal/documents/current') {
      if (options.legalStatus && options.legalStatus !== 200) {
        return route.fulfill({
          status: options.legalStatus,
          contentType: 'application/json',
          body: JSON.stringify({ code: options.legalStatus, message: 'unavailable', data: null }),
        })
      }
      return success({
        privacyPolicy: {
          version: privacyVersion,
          url: `${baseUrl}/legal/privacy/index.html`,
          effectiveAt: '2026-08-13T00:00:00Z',
          requiresReconsent: false,
        },
        termsOfService: {
          version: termsVersion,
          url: `${baseUrl}/legal/terms/index.html`,
          effectiveAt: '2026-08-13T00:00:00Z',
          requiresReconsent: false,
        },
        aiProcessingNotice: null,
      })
    }
    if (path === '/api/blog/comments/captcha' && request.method() === 'GET') {
      captchaSequence += 1
      return success({
        captchaId: `captcha-${captchaSequence}`,
        imageBase64: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iNDAiPjx0ZXh0IHg9IjEwIiB5PSIyOCI+QUIxMjM0PC90ZXh0Pjwvc3ZnPg==',
        mimeType: 'image/svg+xml',
        expiresInSeconds: 300,
      })
    }
    if (path === '/api/auth/register/email-code' && request.method() === 'POST') {
      emailCodeRequests.push(request.postDataJSON() as Record<string, unknown>)
      return success({ retryAfterSeconds: 60 })
    }
    if (path === '/api/auth/register' && request.method() === 'POST') {
      registerRequests.push(request.postDataJSON() as Record<string, unknown>)
      return success({ userId: 42 })
    }

    return success(null)
  })

  return { registerRequests, emailCodeRequests, getCaptchaSequence: () => captchaSequence }
}

test('publishes legal pages and submits the current document versions during registration', async ({ page }) => {
  const { registerRequests } = await mockLegalBackend(page)

  await page.goto(`${baseUrl}/legal/privacy/index.html`)
  await expect(page.getByRole('heading', { name: 'Jokester AI Image 隐私政策' })).toBeVisible()
  await expect(page.getByText(`版本：${privacyVersion}`)).toBeVisible()
  await expect(page.getByText('生效日期：2026 年 8 月 13 日')).toBeVisible()
  await expect(page.getByText('内部草案')).toHaveCount(0)

  await page.goto(`${baseUrl}/legal/terms/index.html`)
  await expect(page.getByRole('heading', { name: 'Jokester AI Image 服务条款' })).toBeVisible()
  await expect(page.getByText(`版本：${termsVersion}`)).toBeVisible()
  await expect(page.getByText('生效日期：2026 年 8 月 13 日')).toBeVisible()

  await page.goto(`${baseUrl}/register`)
  const privacyLink = page.locator('.legal-consents a').filter({ hasText: '隐私政策' })
  const termsLink = page.locator('.legal-consents a').filter({ hasText: '服务条款' })
  await expect(privacyLink).toHaveAttribute('href', `${baseUrl}/legal/privacy/index.html`)
  await expect(termsLink).toHaveAttribute('href', `${baseUrl}/legal/terms/index.html`)

  await page.getByLabel('账号').fill('legaltester1')
  await page.getByLabel('昵称').fill('Legal Tester')
  await page.getByLabel('邮箱', { exact: true }).fill('[邮箱]')
  await page.getByLabel('邮箱验证码').fill('123456')
  await page.getByLabel('密码', { exact: true }).fill('[密钥]')
  await page.getByLabel('确认密码').fill('[密钥]')
  await page.locator('.legal-consents .el-checkbox__inner').nth(0).click()
  await page.locator('.legal-consents .el-checkbox__inner').nth(1).click()
  await expect(page.locator('.legal-consents input[type="checkbox"]').nth(0)).toBeChecked()
  await expect(page.locator('.legal-consents input[type="checkbox"]').nth(1)).toBeChecked()
  const registerButton = page.getByRole('button', { name: '注册', exact: true })
  await expect(registerButton).toBeEnabled()
  await registerButton.click()

  await expect.poll(() => registerRequests.length).toBe(1)
  expect(registerRequests[0]).toMatchObject({
    userName: 'legaltester1',
    acceptedPrivacyPolicy: true,
    privacyPolicyVersion: privacyVersion,
    acceptedTermsOfService: true,
    termsOfServiceVersion: termsVersion,
    clientPlatform: 'web',
    locale: 'zh-CN',
  })
})

test('validates account names before sending a registration request', async ({ page }) => {
  const { registerRequests } = await mockLegalBackend(page)

  await page.goto(`${baseUrl}/register`)
  const accountInput = page.getByLabel('账号')
  const accountError = page.locator('.user-name-field .el-form-item__error')
  const registerButton = page.getByRole('button', { name: '注册', exact: true })
  await page.locator('.legal-consents .el-checkbox__inner').nth(0).click()
  await page.locator('.legal-consents .el-checkbox__inner').nth(1).click()
  await expect(accountInput).toHaveAttribute('maxlength', '20')

  for (const invalidAccount of ['abc12', '123456', 'abcdef', 'abc@123']) {
    await accountInput.fill(invalidAccount)
    await accountInput.blur()
    await expect(accountError).toHaveText('账号需为 6-20 位字母和数字，以字母开头且至少包含 1 个数字')
    await registerButton.click()
    expect(registerRequests).toHaveLength(0)
  }

  await accountInput.fill('tester123')
  await accountInput.blur()
  await expect(accountError).toHaveCount(0)
  await page.getByLabel('昵称').fill('Tester')
  await page.getByLabel('邮箱', { exact: true }).fill('tester@example.com')
  await page.getByLabel('邮箱验证码').fill('123456')
  await page.getByLabel('密码', { exact: true }).fill('Password123')
  await page.getByLabel('确认密码').fill('Password123')
  await registerButton.click()

  await expect.poll(() => registerRequests.length).toBe(1)
  expect(registerRequests[0]).toMatchObject({ userName: 'tester123' })
})

test('keeps public legal pages and registration links within the mobile viewport', async ({ page }) => {
  await mockLegalBackend(page)
  await page.setViewportSize({ width: 390, height: 844 })

  for (const path of ['/legal/privacy/index.html', '/legal/terms/index.html', '/register']) {
    await page.goto(`${baseUrl}${path}`)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  }

  await expect(page.locator('.legal-consents')).toBeVisible()
  await expect(page.locator('.auth-layout__legal')).toBeVisible()
})

test('uses bundled legal documents when the legacy backend protects the current-documents endpoint', async ({ page }) => {
  const { registerRequests } = await mockLegalBackend(page, { legalStatus: 401 })

  await page.goto(`${baseUrl}/register`)
  const consents = page.locator('.legal-consents')
  await expect(consents).toBeVisible()
  await expect(consents.getByRole('link', { name: '隐私政策' })).toHaveAttribute('href', '/legal/privacy/index.html')
  await expect(consents.getByRole('link', { name: '服务条款' })).toHaveAttribute('href', '/legal/terms/index.html')

  await page.getByLabel('账号').fill('legacylegal1')
  await page.getByLabel('昵称').fill('Legacy Legal Tester')
  await page.getByLabel('邮箱', { exact: true }).fill('[邮箱]')
  await page.getByLabel('邮箱验证码').fill('123456')
  await page.getByLabel('密码', { exact: true }).fill('[密钥]')
  await page.getByLabel('确认密码').fill('[密钥]')
  await consents.locator('.el-checkbox__inner').nth(0).click()
  await consents.locator('.el-checkbox__inner').nth(1).click()
  await page.getByRole('button', { name: '注册', exact: true }).click()

  await expect.poll(() => registerRequests.length).toBe(1)
  expect(registerRequests[0]).toMatchObject({
    acceptedPrivacyPolicy: true,
    privacyPolicyVersion: privacyVersion,
    acceptedTermsOfService: true,
    termsOfServiceVersion: termsVersion,
    clientPlatform: 'web',
    locale: 'zh-CN',
  })
})

test('submits the image captcha before sending a registration email code', async ({ page }) => {
  const { emailCodeRequests, getCaptchaSequence } = await mockLegalBackend(page)

  await page.goto(`${baseUrl}/register`)
  await expect(page.getByRole('img', { name: '图片验证码' })).toBeVisible()
  await page.getByLabel('邮箱', { exact: true }).fill('[邮箱]')
  await page.getByLabel('图片验证码', { exact: true }).fill('AB1234')
  const sendButton = page.getByRole('button', { name: '发送验证码', exact: true })
  await expect(sendButton).toBeEnabled()
  await sendButton.click()

  await expect.poll(() => emailCodeRequests.length).toBe(1)
  expect(emailCodeRequests[0]).toEqual({
    email: '[邮箱]',
    captchaId: 'captcha-1',
    captchaAnswer: 'AB1234',
  })
  await expect.poll(getCaptchaSequence).toBe(2)
  await expect(page.getByLabel('图片验证码', { exact: true })).toHaveValue('')
})

test('uses the published zh-CN legal versions when the interface is English', async ({ page }) => {
  let requestedLocale = ''
  await page.addInitScript(() => localStorage.setItem('locale', 'en-US'))
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/legal/documents/current') {
      requestedLocale = url.searchParams.get('locale') || ''
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'success',
          data: {
            privacyPolicy: {
              version: privacyVersion,
              url: `${baseUrl}/legal/privacy/index.html`,
              effectiveAt: '2026-08-13T00:00:00Z',
              requiresReconsent: false,
            },
            termsOfService: {
              version: termsVersion,
              url: `${baseUrl}/legal/terms/index.html`,
              effectiveAt: '2026-08-13T00:00:00Z',
              requiresReconsent: false,
            },
            aiProcessingNotice: null,
          },
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'success', data: null }),
    })
  })

  await page.goto(`${baseUrl}/register`)
  await expect(page.getByRole('link', { name: 'Privacy Policy', exact: true }).first()).toBeVisible()
  await expect.poll(() => requestedLocale).toBe('zh-CN')
})
