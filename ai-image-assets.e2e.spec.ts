import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'
const accessToken = 'ai-image-assets-e2e-token'
const assetId = 'AST20260813000000E2ETESTASSET01'
const assetUrl = `/api/assets/${assetId}/content`
const imagePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0cAAAAASUVORK5CYII=',
  'base64',
)

type ErrorMode = 'none' | 'prompt-blocked' | 'rate-limited' | 'parameters-unavailable' | 'pricing-unavailable' | 'two-k-route-unavailable' | 'balance-unavailable' | 'history-processing' | 'history-navigation-inflight' | 'detail-processing' | 'generation-unknown-recovery' | 'generation-unknown-empty-failure-recovery' | 'generation-unknown-baseline-failure' | 'generation-gateway-timeout-recovery'

type MockBackendOptions = {
  allGptQualities?: boolean
  multiImageTasks?: boolean
}

type MockState = {
  assetAuthorizations: string[]
  balanceRequests: number
  creditDetailRequests: number
  detailRequests: number
  galleryListRequests: number
  generatedRequests: Array<Record<string, unknown>>
  generationRequestPaths: string[]
  multiTaskRequests: Record<string, number>
}

async function mockBackend(page: Page, errorMode: ErrorMode = 'none', options: MockBackendOptions = {}): Promise<MockState> {
  const state: MockState = {
    assetAuthorizations: [],
    balanceRequests: 0,
    creditDetailRequests: 0,
    detailRequests: 0,
    galleryListRequests: 0,
    generatedRequests: [],
    generationRequestPaths: [],
    multiTaskRequests: {},
  }

  await page.addInitScript((token) => {
    localStorage.setItem('accessToken', token)
    localStorage.setItem('locale', 'zh-CN')
  }, accessToken)

  const imageRecord = (
    status: 'queued' | 'succeeded',
    withAsset: boolean,
    createdAt = '2026-08-13T00:00:00Z',
    prompt = 'Asset-only gallery result',
  ) => ({
    id: 99,
    taskId: 99,
    siteId: 1,
    prompt,
    modelName: 'GPT Image 2',
    imageCount: 1,
    completedImageCount: withAsset ? 1 : 0,
    pointCost: 1,
    billingStatus: withAsset ? 1 : 0,
    resolutionCode: '1k',
    qualityCode: 'med',
    aspectRatioCode: '1:1',
    width: 1024,
    height: 1024,
    size: '1024x1024',
    quality: 'medium',
    referenceImageUrls: [],
    resultUrls: withAsset ? [assetUrl] : [],
    favoriteUrls: [],
    isFavorite: false,
    status,
    createdAt,
    assets: withAsset ? [{ url: assetUrl }] : [],
  })

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
      state.balanceRequests += 1
      if (errorMode === 'balance-unavailable') {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Balance unavailable' }),
        })
      }
      return success({
        availablePoints: 500,
        permanentPoints: 400,
        expiringPoints: 100,
        nextExpiringPoints: 100,
        nextExpireAt: '2026-09-01T00:00:00Z',
        hasSignedInToday: false,
        todaySignInPoints: 0,
      })
    }
    if (path === '/api/points/details') {
      state.creditDetailRequests += 1
      return success({ items: [], total: 0, pageIndex: 1, pageSize: 20 })
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
        resolutions: [
          { code: '1k', name: '1K', sort: 1 },
          { code: '4k', name: '4K', sort: 2 },
          { code: '2k', name: '2K', sort: 3 },
        ],
        qualities: options.allGptQualities
          ? [
              { code: 'low', name: 'Low', sort: 1 },
              { code: 'med', name: 'Medium', sort: 2 },
              { code: 'high', name: 'High', sort: 3 },
            ]
          : [{ code: 'med', name: 'Medium', sort: 1 }],
        aspectRatios: [
          { code: 'auto', name: 'Auto', sort: 1 },
          { code: '1:1', name: '1:1', sort: 2 },
        ],
        pointPrices: [],
      })
    }
    if (path === '/api/ai/images/models') {
      return success([
        {
          code: 'gpt-image-2',
          name: 'GPT Image 2',
          sort: 1,
          resolutions: errorMode === 'two-k-route-unavailable' ? ['1k', '4k'] : ['1k', '4k', '2k'],
          qualities: options.allGptQualities ? ['low', 'med', 'high'] : ['med'],
          aspectRatios: ['1:1'],
          capabilities: {
            supportsReferenceImages: true,
            maxReferenceImages: 6,
            supportsQuality: true,
            supportedImageCounts: [1, 2, 3, 4],
          },
        },
        {
          code: 'ios-featured-image-model',
          name: 'iOS Featured Image Model',
          providerCode: 'google',
          sort: 2,
          resolutions: ['1k', '2k'],
          qualities: [],
          aspectRatios: ['auto', '1:1'],
          capabilities: {
            supportsReferenceImages: true,
            maxReferenceImages: 6,
            supportsQuality: false,
            supportedImageCounts: [1, 2, 3, 4],
          },
        },
      ])
    }
    if (path === '/api/ai/images/pricing-options') {
      if (errorMode === 'pricing-unavailable') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'SERVER_ERROR', message: 'Pricing unavailable' }),
        })
      }
      const gptPrices = options.allGptQualities
        ? [
            { modelCode: 'gpt-image-2', resolutionCode: '1k', qualityCode: 'low', points: 10 },
            { modelCode: 'gpt-image-2', resolutionCode: '1k', qualityCode: 'med', points: 15 },
            { modelCode: 'gpt-image-2', resolutionCode: '1k', qualityCode: 'high', points: 20 },
            { modelCode: 'gpt-image-2', resolutionCode: '2k', qualityCode: 'low', points: 15 },
            { modelCode: 'gpt-image-2', resolutionCode: '2k', qualityCode: 'med', points: 30 },
            { modelCode: 'gpt-image-2', resolutionCode: '2k', qualityCode: 'high', points: 60 },
            { modelCode: 'gpt-image-2', resolutionCode: '4k', qualityCode: 'low', points: 25 },
            { modelCode: 'gpt-image-2', resolutionCode: '4k', qualityCode: 'med', points: 35 },
            { modelCode: 'gpt-image-2', resolutionCode: '4k', qualityCode: 'high', points: 50 },
          ]
        : [
            { modelCode: 'gpt-image-2', resolutionCode: '1k', qualityCode: 'med', points: 1 },
            { modelCode: 'gpt-image-2', resolutionCode: '2k', qualityCode: 'med', points: 30 },
            { modelCode: 'gpt-image-2', resolutionCode: '4k', qualityCode: 'med', points: 4 },
          ]
      return success([
        ...gptPrices,
        { modelCode: 'ios-featured-image-model', resolutionCode: '1k', points: 1 },
        { modelCode: 'ios-featured-image-model', resolutionCode: '2k', points: 2 },
      ])
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
    if (['/api/ai/images', '/api/ai/images/nanoBananaImage'].includes(path) && method === 'POST') {
      state.generationRequestPaths.push(path)
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
      if (
        errorMode === 'generation-unknown-recovery'
        || errorMode === 'generation-unknown-empty-failure-recovery'
        || errorMode === 'generation-unknown-baseline-failure'
      ) return route.abort('timedout')
      if (errorMode === 'generation-gateway-timeout-recovery') {
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'GATEWAY_TIMEOUT', message: 'Upstream request timed out' }),
        })
      }
      if (options.multiImageTasks) {
        return success({ id: 100, ids: [101, 102], taskIds: [101, 102], status: 'queued' })
      }
      return success({ id: 99, taskId: 99, status: 'succeeded', assets: [{ url: assetUrl }] })
    }
    if (options.multiImageTasks && ['/api/ai/images/101', '/api/ai/images/102'].includes(path) && method === 'GET') {
      const taskId = path.endsWith('/101') ? 101 : 102
      const requestKey = String(taskId)
      state.multiTaskRequests[requestKey] = (state.multiTaskRequests[requestKey] || 0) + 1
      const processing = taskId === 102 && state.multiTaskRequests[requestKey] === 1
      const color = taskId === 101 ? 'red' : 'blue'
      const imageUrl = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="${color}"/></svg>`)}`
      return success({
        ...imageRecord(processing ? 'queued' : 'succeeded', false),
        id: taskId,
        taskId,
        status: processing ? 'queued' : 'succeeded',
        pollAfterSeconds: taskId === 102 ? 2 : 1,
        resultUrls: processing ? [] : [imageUrl],
        assets: processing ? [] : [{ url: imageUrl }],
      })
    }
    if (path === '/api/ai/images/99' && method === 'GET') {
      state.detailRequests += 1
      const processing = errorMode === 'detail-processing' && state.detailRequests <= 2
      return success(imageRecord(processing ? 'queued' : 'succeeded', !processing))
    }
    if (path === '/api/ai/images' && method === 'GET') {
      state.galleryListRequests += 1
      if (errorMode === 'history-navigation-inflight') {
        if (state.galleryListRequests === 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        return success({
          total: 1,
          pageIndex: 1,
          pageSize: 20,
          items: [imageRecord('queued', false)],
        })
      }
      if (errorMode === 'generation-unknown-baseline-failure' && state.galleryListRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Baseline unavailable' }),
        })
      }
      if (errorMode === 'generation-unknown-empty-failure-recovery' && state.galleryListRequests === 2) {
        return success({ total: 0, pageIndex: 1, pageSize: 20, items: [] })
      }
      if (errorMode === 'generation-unknown-empty-failure-recovery' && state.galleryListRequests === 3) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'History temporarily unavailable' }),
        })
      }
      if (
        errorMode === 'generation-unknown-recovery'
        || errorMode === 'generation-unknown-empty-failure-recovery'
        || errorMode === 'generation-unknown-baseline-failure'
        || errorMode === 'generation-gateway-timeout-recovery'
      ) {
        const visibleAfterRequest = errorMode === 'generation-unknown-empty-failure-recovery'
          ? 4
          : errorMode === 'generation-unknown-baseline-failure'
            ? 2
            : 3
        const taskVisible = state.generatedRequests.length > 0 && state.galleryListRequests >= visibleAfterRequest
        const submittedRequest = state.generatedRequests[0] || {}
        const targetPrompt = String(submittedRequest.prompt || 'Recover this task from history')
        const record = {
          ...imageRecord(
            'succeeded',
            true,
            new Date().toISOString(),
            targetPrompt,
          ),
          modelCode: String(submittedRequest.modelCode || 'gpt-image-2'),
          imageCount: Number(submittedRequest.imageCount || 1),
          resolutionCode: String(submittedRequest.resolutionCode || '1k'),
          qualityCode: String(submittedRequest.qualityCode || 'med'),
          aspectRatioCode: String(submittedRequest.aspectRatioCode || '1:1'),
          sourcePromptId: typeof submittedRequest.sourcePromptId === 'number'
            ? submittedRequest.sourcePromptId
            : null,
        }
        return success({
          total: 1,
          pageIndex: 1,
          pageSize: 20,
          items: [taskVisible ? record : { ...record, id: 98, taskId: 98 }],
        })
      }
      const processing = errorMode === 'history-processing' && state.galleryListRequests === 1
      return success({
        total: 1,
        pageIndex: 1,
        pageSize: 20,
        items: [imageRecord(processing ? 'queued' : 'succeeded', !processing)],
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

test('requires a prompt and keeps the empty preview aligned with the parameter panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await mockBackend(page)
  await openPlayground(page)

  const promptInput = page.locator('.prompt-textarea textarea')
  const generateButton = page.locator('button.generate')
  await expect(page.locator('.monthly-vip-badge')).toHaveCount(0)
  await expect(generateButton).toBeDisabled()

  await promptInput.fill('   ')
  await expect(generateButton).toBeDisabled()

  const desktopHeights = await Promise.all([
    page.locator('.prompt-panel').evaluate((element) => element.getBoundingClientRect().height),
    page.locator('.preview').evaluate((element) => element.getBoundingClientRect().height),
  ])
  expect(Math.abs(desktopHeights[0] - desktopHeights[1])).toBeLessThanOrEqual(1)

  await promptInput.fill('A valid image prompt')
  await expect(generateButton).toBeEnabled()
  await promptInput.fill('')
  await expect(generateButton).toBeDisabled()

  await page.setViewportSize({ width: 1024, height: 900 })
  const singleColumnLayout = await page.evaluate(() => {
    const promptPanel = document.querySelector('.prompt-panel')?.getBoundingClientRect()
    const preview = document.querySelector('.preview')?.getBoundingClientRect()
    return {
      promptBottom: promptPanel?.bottom || 0,
      previewTop: preview?.top || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }
  })
  expect(singleColumnLayout.previewTop).toBeGreaterThan(singleColumnLayout.promptBottom)
  expect(singleColumnLayout.scrollWidth).toBeLessThanOrEqual(singleColumnLayout.clientWidth)
})

test('keeps a manually entered prompt when navigating away and back', async ({ page }) => {
  await mockBackend(page)
  await openPlayground(page)

  const prompt = 'Keep this manually entered prompt while I check the gallery.'
  await page.locator('.prompt-textarea textarea').fill(prompt)
  await page.locator('.sidebar nav a[href="/images"]').click()
  await expect(page).toHaveURL(/\/images$/)
  await page.locator('.sidebar nav a[href="/playground"]').click()
  await expect(page).toHaveURL(/\/playground$/)
  await expect(page.locator('.prompt-textarea textarea')).toHaveValue(prompt)
  await page.reload()
  await expect(page.locator('.prompt-textarea textarea')).toHaveValue(prompt)
})

test('restores a URL reference and source prompt once after a full reload', async ({ page }) => {
  const state = await mockBackend(page)
  const restoredReferenceUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0cAAAAASUVORK5CYII='
  await openPlayground(page)
  await page.evaluate((referenceUrl) => {
    sessionStorage.setItem('playgroundDraft', JSON.stringify({
      version: 1,
      ownerUserId: 7,
      manualPrompt: 'Reference restore prompt',
      draft: {
        prompt: 'Reference restore prompt',
        modelCode: 'gpt-image-2',
        resolutionCode: '1k',
        qualityCode: 'med',
        aspectRatioCode: '1:1',
        imageCount: 1,
        sourcePromptId: 314,
        references: [{
          url: referenceUrl,
          assetId: '',
        }],
      },
    }))
  }, restoredReferenceUrl)

  await page.reload()
  await expect(page.locator('.prompt-textarea textarea')).toHaveValue('Reference restore prompt')
  await expect(page.locator('.preview-card')).toHaveCount(1)
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0]).toMatchObject({
    prompt: 'Reference restore prompt',
    sourcePromptId: 314,
    referenceImageUrls: [restoredReferenceUrl],
  })
})

test('offers the catalog auto aspect ratio to legacy models and submits it', async ({ page }) => {
  const state = await mockBackend(page)
  await openPlayground(page)

  const aspectRatioSelect = page.locator('.parameter-grid .el-select').first()
  await expect(aspectRatioSelect).toContainText('1:1')
  await aspectRatioSelect.click()
  const autoOption = page.getByRole('option', { name: /^(自动|Auto)$/ })
  await expect(autoOption).toBeVisible()
  await autoOption.click()

  await page.locator('.prompt-textarea textarea').fill('Generate with an automatic aspect ratio')
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0].aspectRatioCode).toBe('auto')
})

test('shows all GPT Image 2 2K prices and submits the selected tier', async ({ page }) => {
  const state = await mockBackend(page, 'none', { allGptQualities: true })
  await openPlayground(page)

  const resolutionControl = page.locator('.parameter-grid .el-segmented').first()
  await expect(resolutionControl.locator('.el-segmented__item-label')).toHaveText([
    '1K(快速预览)',
    '2K(推荐尺寸)',
    '4K(超清画质)',
  ])
  await expect(resolutionControl.locator('.el-segmented__item.is-selected')).toContainText('2K(推荐尺寸)')

  const qualityControl = page.locator('.parameter-grid .el-segmented').nth(1)
  await qualityControl.getByText('Low(快速/基础)', { exact: true }).click()
  await expect(page.locator('.cost-hint')).toContainText('本次预计消耗: 15')
  await qualityControl.getByText('Medium(标准)', { exact: true }).click()
  await expect(page.locator('.cost-hint')).toContainText('本次预计消耗: 30')
  await qualityControl.getByText('High(高精细)', { exact: true }).click()
  await expect(page.locator('.cost-hint')).toContainText('本次预计消耗: 60')

  await page.locator('.prompt-textarea textarea').fill('Generate a high quality 2K image')
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0]).toMatchObject({
    modelCode: 'gpt-image-2',
    resolutionCode: '2k',
    qualityCode: 'high',
    aspectRatioCode: '1:1',
  })
})

test('hides GPT Image 2 2K when the model has no enabled 2K route', async ({ page }) => {
  await mockBackend(page, 'two-k-route-unavailable')
  await openPlayground(page)

  const resolutionControl = page.locator('.parameter-grid .el-segmented').first()
  await expect(resolutionControl).toContainText('1K')
  await expect(resolutionControl).toContainText('4K')
  await expect(resolutionControl).not.toContainText('2K')
})

test('uses model capabilities for Google image generation and posts to the unified endpoint', async ({ page }) => {
  const state = await mockBackend(page)
  await openPlayground(page)

  const modelSelect = page.locator('.prompt-panel .el-select').first()
  await modelSelect.click()
  await page.getByRole('option', { name: 'iOS Featured Image Model' }).click()
  await expect(modelSelect).toContainText('iOS Featured Image Model')
  await expect(page.locator('.parameter-grid .el-form-item__label').filter({ hasText: '生成质量' })).toHaveCount(0)

  const resolutionControl = page.locator('.parameter-grid .el-segmented').first()
  await expect(resolutionControl).toContainText('2K')
  await resolutionControl.getByText('2K(推荐尺寸)', { exact: true }).click()

  const aspectRatioSelect = page.locator('.parameter-grid .el-select').first()
  await aspectRatioSelect.click()
  const autoOption = page.getByRole('option', { name: /^(自动|Auto)$/ })
  await expect(autoOption).toBeVisible()
  await autoOption.click()

  const prompt = 'Create a polished featured image for an iOS release.'
  await page.locator('.prompt-textarea textarea').fill(prompt)
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generationRequestPaths).toEqual(['/api/ai/images'])
  const generatedRequest = state.generatedRequests[0]
  expect(generatedRequest).toMatchObject({
    prompt,
    modelCode: 'ios-featured-image-model',
    modelName: 'ios-featured-image-model',
    imageCount: 1,
    resolutionCode: '2k',
    aspectRatioCode: 'auto',
    referenceImageUrls: [],
    referenceAssetIds: [],
  })
  expect(generatedRequest).not.toHaveProperty('qualityCode')
})

test('renders asset-only generation and gallery results with authentication and submits reference asset ids', async ({ page }) => {
  const state = await mockBackend(page)
  await openPlayground(page)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: imagePng,
  })
  await expect(page.locator('button.generate')).toBeDisabled()
  await page.locator('.prompt-textarea textarea').fill('Generate an asset-backed image')
  await expect(page.locator('button.generate')).toBeEnabled()
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0].referenceAssetIds).toEqual([assetId])
  expect(state.generatedRequests[0].referenceImageUrls).toEqual([])
  await expect.poll(() => state.creditDetailRequests).toBeGreaterThanOrEqual(1)

  const generatedImage = page.locator('.task-card img')
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

test('loads two generated tasks independently and shows both distinct results', async ({ page }) => {
  const state = await mockBackend(page, 'none', { multiImageTasks: true })
  await openPlayground(page)
  await expect(page.locator('.app-logo strong')).toHaveText('Jo AI Image')
  await expect(page.locator('.app-logo__mark')).toHaveAttribute('src', '/logo.png')

  const batchSelect = page.locator('.inline-parameter-row .el-select').last()
  await batchSelect.click()
  await page.getByRole('option', { name: '2张', exact: true }).click()
  await page.locator('.prompt-textarea textarea').fill('Generate two distinct images')
  await page.locator('button.generate').click()

  await expect(page.locator('.task-card')).toHaveCount(2)
  await expect(page.locator('.task-card img')).toHaveCount(1)
  await expect(page.locator('.task-state')).toHaveCount(1)
  const pendingTaskIds = await page.evaluate(() => JSON.parse(localStorage.getItem('pendingAiImageTaskId') || '{}').taskIds)
  expect(pendingTaskIds).toEqual([101, 102])
  await expect(page.locator('.task-card img')).toHaveCount(2, { timeout: 8_000 })

  const resultSources = await page.locator('.task-card img').evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src))
  expect(new Set(resultSources).size).toBe(2)
  expect(state.multiTaskRequests['101']).toBeGreaterThanOrEqual(1)
  expect(state.multiTaskRequests['102']).toBeGreaterThanOrEqual(2)
})

test('keeps queued history visible and refreshes credits when the task completes', async ({ page }) => {
  const state = await mockBackend(page, 'history-processing')
  await page.goto(`${baseUrl}/images`)

  await expect(page.getByText('任务排队中', { exact: true })).toBeVisible()
  const initialBalanceRequests = state.balanceRequests
  await expect(page.locator('.image-card img')).toBeVisible({ timeout: 8_000 })
  await expect.poll(() => state.galleryListRequests).toBeGreaterThanOrEqual(2)
  await expect.poll(() => state.creditDetailRequests).toBeGreaterThanOrEqual(1)
  expect(state.balanceRequests).toBeGreaterThan(initialBalanceRequests)
})

test('ignores an identical baseline task while recovering an unknown creation result', async ({ page }) => {
  const state = await mockBackend(page, 'generation-unknown-recovery')
  await openPlayground(page)
  const initialBalanceRequests = state.balanceRequests

  await page.locator('.prompt-textarea textarea').fill('Recover this task from history')
  await page.locator('button.generate').click()

  await expect(page).toHaveURL(/\/images$/)
  await expect.poll(() => state.galleryListRequests).toBe(2)
  expect(await page.evaluate(() => sessionStorage.getItem('pendingAiImageHistoryRecovery'))).not.toBeNull()
  await expect.poll(() => state.galleryListRequests, { timeout: 8_000 }).toBeGreaterThanOrEqual(3)
  await expect(page.locator('.image-card img')).toBeVisible()
  await expect.poll(() => state.creditDetailRequests).toBeGreaterThanOrEqual(2)
  expect(state.balanceRequests).toBeGreaterThanOrEqual(initialBalanceRequests + 2)
  expect(await page.evaluate(() => sessionStorage.getItem('pendingAiImageHistoryRecovery'))).toBeNull()
})

test('recovers an unknown creation result after an HTTP 504 gateway timeout', async ({ page }) => {
  const state = await mockBackend(page, 'generation-gateway-timeout-recovery')
  await openPlayground(page)

  await page.locator('.prompt-textarea textarea').fill('Recover this gateway timeout from history')
  await page.locator('button.generate').click()

  await expect(page).toHaveURL(/\/images$/)
  await expect.poll(() => state.galleryListRequests, { timeout: 8_000 }).toBeGreaterThanOrEqual(3)
  await expect(page.locator('.image-card img')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('pendingAiImageHistoryRecovery'))).toBeNull()
})

test('keeps recovering after an empty history page and a temporary list failure', async ({ page }) => {
  const state = await mockBackend(page, 'generation-unknown-empty-failure-recovery')
  await openPlayground(page)

  await page.locator('.prompt-textarea textarea').fill('Recover after empty and failed history reads')
  await page.locator('button.generate').click()

  await expect(page).toHaveURL(/\/images$/)
  await expect.poll(() => state.galleryListRequests, { timeout: 10_000 }).toBeGreaterThanOrEqual(4)
  await expect(page.locator('.image-card img')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('pendingAiImageHistoryRecovery'))).toBeNull()
})

test('does not guess a matching task when the preflight history baseline fails', async ({ page }) => {
  const state = await mockBackend(page, 'generation-unknown-baseline-failure')
  await openPlayground(page)

  await page.locator('.prompt-textarea textarea').fill('Do not guess without a baseline')
  await page.locator('button.generate').click()

  await expect(page).toHaveURL(/\/images$/)
  await expect.poll(() => state.galleryListRequests, { timeout: 8_000 }).toBeGreaterThanOrEqual(3)
  await expect(page.locator('.image-card img')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('pendingAiImageHistoryRecovery'))).not.toBeNull()
})

test('does not restart gallery polling after an in-flight list request settles on another route', async ({ page }) => {
  const state = await mockBackend(page, 'history-navigation-inflight')
  await page.goto(`${baseUrl}/images`)
  await expect.poll(() => state.galleryListRequests).toBe(1)

  await page.locator('.sidebar a[href="/playground"]').click()
  await expect(page).toHaveURL(/\/playground$/)
  await page.waitForTimeout(4_500)

  expect(state.galleryListRequests).toBe(1)
})

test('continues polling a queued task from its detail page', async ({ page }) => {
  const state = await mockBackend(page, 'detail-processing')
  await page.goto(`${baseUrl}/images/99/edit`)

  await expect(page.getByText('任务排队中', { exact: true })).toBeVisible()
  await expect(page.locator('.hero-image img')).toBeVisible({ timeout: 8_000 })
  await expect.poll(() => state.detailRequests).toBeGreaterThanOrEqual(3)
  await expect.poll(() => state.creditDetailRequests).toBeGreaterThanOrEqual(1)
})

test('keeps GPT 2K available and submits it when the parameter catalog fails', async ({ page }) => {
  const state = await mockBackend(page, 'parameters-unavailable')
  await openPlayground(page)

  const resolutionControl = page.locator('.parameter-grid .el-segmented').first()
  await expect(resolutionControl).toContainText('2K')
  await resolutionControl.getByText('2K(推荐尺寸)', { exact: true }).click()
  await expect(page.locator('.cost-hint')).toContainText('本次预计消耗: 30')
  await page.locator('.prompt-textarea textarea').fill('Generate despite a parameter catalog failure')
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0].modelCode).toBe('gpt-image-2')
  expect(state.generatedRequests[0].resolutionCode).toBe('2k')
})

test('keeps GPT 2K visible but generation disabled when pricing is unavailable', async ({ page }) => {
  await mockBackend(page, 'pricing-unavailable')
  await openPlayground(page)

  const resolutionControl = page.locator('.parameter-grid .el-segmented').first()
  await expect(resolutionControl).toContainText('2K')
  await expect(resolutionControl).toContainText('1K')
  await resolutionControl.getByText('2K(推荐尺寸)', { exact: true }).click()
  await page.locator('.prompt-textarea textarea').fill('Pricing must be available')
  await expect(page.locator('button.generate')).toBeDisabled()
  await expect(page.getByText('当前参数的积分定价暂不可用，请重试或调整参数。')).toBeVisible()
})

test('does not treat an unavailable balance as zero credits', async ({ page }) => {
  await mockBackend(page, 'balance-unavailable')
  await openPlayground(page)

  await page.locator('.prompt-textarea textarea').fill('Balance must be available')
  await expect(page.locator('button.generate')).toBeDisabled()
  await expect(page.getByText('暂时无法读取可用积分，请重试后再生成。', { exact: true })).toBeVisible()
  await expect(page.getByText('当前可用积分不足，请先获取积分。')).toHaveCount(0)
})

test('shows the prompt filter user message', async ({ page }) => {
  await mockBackend(page, 'prompt-blocked')
  await openPlayground(page)

  await page.locator('.prompt-textarea textarea').fill('Blocked prompt')
  await page.locator('button.generate').click()

  await expect(page.locator('.el-message__content')).toContainText('提示词未通过内容安全检查，请调整后重试。')
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
