import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://[IP]:5176'
const accessToken = 'ai-image-assets-e2e-token'
const assetId = 'AST20260813000000E2ETESTASSET01'
const assetUrl = `/api/assets/${assetId}/content`
const imagePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0cAAAAASUVORK5CYII=',
  'base64',
)

type ErrorMode = 'none' | 'prompt-blocked' | 'rate-limited' | 'parameters-unavailable' | 'pricing-unavailable'

type MockState = {
  assetAuthorizations: string[]
  generatedRequests: Array<Record<string, unknown>>
}

test.use({
  launchOptions: {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  },
})

async function mockBackend(page: Page, errorMode: ErrorMode = 'none'): Promise<MockState> {
  const state: MockState = { assetAuthorizations: [], generatedRequests: [] }

  await page.addInitScript((token) => {
    localStorage.setItem('accessToken', token)
  }, accessToken)

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const success = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'success', data }),
    })

    if (path === '/api/auth/profile') {
      return success({ id: 7, userName: 'asset-tester', nickName: 'Asset Tester', pointBalance: 500 })
    }
    if (path === '/api/points/balance') {
      return success({ availablePoints: 500, hasSignedInToday: false, todaySignInPoints: 0 })
    }
    if (path === '/api/ai/images/parameters') {
      if (errorMode === 'parameters-unavailable') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'SERVER_ERROR', message: 'Parameter catalog unavailable' }),
        })
      }
      return success({
        resolutions: [{ code: '1k', name: '1K', sort: 1 }],
        qualities: [{ code: 'med', name: 'Medium', sort: 1 }],
        aspectRatios: [{ code: '1:1', name: '1:1', sort: 1 }],
        pointPrices: [],
      })
    }
    if (path === '/api/ai/images/models') {
      return success([{
        code: 'gpt-image-2',
        name: 'GPT Image 2',
        sort: 1,
        resolutions: ['parameters-unavailable', 'pricing-unavailable'].includes(errorMode) ? ['1k', '2k', '4k'] : ['1k', '4k'],
        qualities: ['med'],
        aspectRatios: ['1:1'],
        capabilities: {
          supportsReferenceImages: true,
          maxReferenceImages: 6,
          supportsQuality: true,
          supportedImageCounts: [1, 2, 3, 4],
        },
      }])
    }
    if (path === '/api/ai/images/pricing-options') {
      if (errorMode === 'pricing-unavailable') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'SERVER_ERROR', message: 'Pricing unavailable' }),
        })
      }
      return success(errorMode === 'parameters-unavailable' ? [
        { modelCode: 'gpt-image-2', resolutionCode: '1k', qualityCode: 'med', points: 1 },
        { modelCode: 'gpt-image-2', resolutionCode: '4k', qualityCode: 'med', points: 4 },
      ] : [])
    }
    if (path === '/api/ai/images/upload' && method === 'POST') {
      return success({
        assetId,
        url: assetUrl,
        thumbnailUrl: `/api/assets/${assetId}/thumbnail`,
        fileName: 'reference.png',
        mimeType: 'image/png',
        fileSize: imagePng.length,
      })
    }
    if (path === '/api/ai/images' && method === 'POST') {
      state.generatedRequests.push(request.postDataJSON() as Record<string, unknown>)
      if (errorMode === 'prompt-blocked') {
        return route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'PROMPT_BLOCKED',
            message: 'The request could not be processed.',
            details: { userMessage: '提示词包含不允许的内容，请修改后重试' },
          }),
        })
      }
      if (errorMode === 'rate-limited') {
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '2' },
          contentType: 'application/json',
          body: JSON.stringify({ code: 'RATE_LIMITED', message: '请求过于频繁' }),
        })
      }
      return success({ id: 99, taskId: 99, status: 'succeeded', assets: [{ url: assetUrl }] })
    }
    if (path === '/api/ai/images' && method === 'GET') {
      return success({
        total: 1,
        pageIndex: 1,
        pageSize: 20,
        items: [{
          id: 99,
          prompt: 'Asset-only gallery result',
          modelName: 'GPT Image 2',
          resolutionCode: '1k',
          qualityCode: 'med',
          status: 'succeeded',
          favoriteUrls: [],
          isFavorite: false,
          createdAt: '2026-08-13T00:00:00Z',
          assets: [{ url: assetUrl }],
        }],
      })
    }
    if (path === assetUrl) {
      const authorization = request.headers().authorization || ''
      state.assetAuthorizations.push(authorization)
      if (authorization !== `Bearer ${accessToken}`) {
        return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
      }
      return route.fulfill({ status: 200, contentType: 'image/png', body: imagePng })
    }

    return success(null)
  })

  return state
}

async function openPlayground(page: Page) {
  await page.goto(`${baseUrl}/playground`)
  await expect(page.locator('.prompt-textarea textarea')).toBeVisible()
  await expect(page.locator('.prompt-panel .el-select').first()).toContainText('GPT Image 2')
}

test('renders asset-only generation and gallery results with authentication and submits reference asset ids', async ({ page }) => {
  const state = await mockBackend(page)
  await openPlayground(page)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: imagePng,
  })
  await expect(page.locator('button.generate')).toBeEnabled()
  await page.locator('.prompt-textarea textarea').fill('Generate an asset-backed image')
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0].referenceAssetIds).toEqual([assetId])
  expect(state.generatedRequests[0].referenceImageUrls).toEqual([])

  const generatedImage = page.locator('.result-images > img')
  await expect(generatedImage).toBeVisible()
  await expect.poll(() => generatedImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  expect(state.assetAuthorizations).toEqual([`Bearer ${accessToken}`])

  await page.goto(`${baseUrl}/images`)
  const galleryImage = page.locator('.image-card img')
  await expect(galleryImage).toBeVisible()
  await expect.poll(() => galleryImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  expect(state.assetAuthorizations.length).toBeGreaterThanOrEqual(2)
  expect(state.assetAuthorizations.every((value) => value === `Bearer ${accessToken}`)).toBe(true)
})

test('keeps generation available without showing GPT 2K when the parameter catalog fails', async ({ page }) => {
  const state = await mockBackend(page, 'parameters-unavailable')
  await openPlayground(page)

  await expect(page.locator('.parameter-grid')).not.toContainText('2K')
  await page.locator('.prompt-textarea textarea').fill('Generate despite a parameter catalog failure')
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0].modelCode).toBe('gpt-image-2')
  expect(state.generatedRequests[0].resolutionCode).toBe('1k')
})

test('keeps GPT on safe resolutions when pricing is unavailable', async ({ page }) => {
  await mockBackend(page, 'pricing-unavailable')
  await openPlayground(page)

  await expect(page.locator('.parameter-grid')).not.toContainText('2K')
  await expect(page.locator('.parameter-grid')).toContainText('1K')
})

test('shows the prompt filter user message', async ({ page }) => {
  await mockBackend(page, 'prompt-blocked')
  await openPlayground(page)

  await page.locator('.prompt-textarea textarea').fill('Blocked prompt')
  await page.locator('button.generate').click()

  await expect(page.locator('.el-message__content')).toContainText('提示词包含不允许的内容，请修改后重试')
  await expect(page.getByText('The request could not be processed.')).toHaveCount(0)
})

test('keeps generation disabled for the Retry-After countdown', async ({ page }) => {
  await mockBackend(page, 'rate-limited')
  await openPlayground(page)

  await page.locator('.prompt-textarea textarea').fill('Rate-limited prompt')
  const generateButton = page.locator('button.generate')
  await generateButton.click()

  await expect(generateButton).toBeDisabled()
  await expect(generateButton).toContainText(/请求过于频繁，\d 秒后可重试/)
  await expect(page.locator('.rate-limit-hint')).toBeVisible()
  await expect(generateButton).toBeEnabled({ timeout: 4_000 })
  await expect(generateButton).toContainText('开始生成')
})
