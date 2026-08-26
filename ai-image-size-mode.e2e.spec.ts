import { expect, test, type Page } from 'playwright/test'

type BackendOptions = {
  explicitOnly?: boolean
  fullResolutionCatalog?: boolean
  catalogMismatch?: boolean
  rejectAutoOnce?: boolean
  galleryTask?: 'queued-auto' | 'succeeded-auto'
  legacyAutoTask?: boolean
}

type BackendState = {
  generatedRequests: Array<Record<string, unknown>>
  generationHeaders: Array<Record<string, string>>
  modelHeaders: Array<Record<string, string>>
  modelRequests: number
}

const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0cAAAAASUVORK5CYII='

async function mockBackend(page: Page, options: BackendOptions = {}): Promise<BackendState> {
  const state: BackendState = {
    generatedRequests: [],
    generationHeaders: [],
    modelHeaders: [],
    modelRequests: 0,
  }
  let autoRejected = false

  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'ai-size-mode-test-token')
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

    if (path === '/api/auth/profile') return success({ id: 7, userName: 'size-tester', nickName: 'Size Tester', pointBalance: 500 })
    if (path === '/api/points/balance') {
      return success({
        availablePoints: 500,
        permanentPoints: 500,
        expiringPoints: 0,
        nextExpiringPoints: 0,
        nextExpireAt: null,
        hasSignedInToday: false,
        todaySignInPoints: 0,
      })
    }
    if (path === '/api/points/details') return success({ items: [], total: 0, pageIndex: 1, pageSize: 20 })
    if (path === '/api/ai/images/parameters') {
      return success({
        resolutions: options.fullResolutionCatalog
          ? [
              { code: '4k', name: '4K', sort: 1 },
              { code: '1k', name: '1K', sort: 3 },
              { code: '2k', name: '2K', sort: 2 },
            ]
          : [{ code: '1k', name: '1K', sort: 1 }, { code: '2k', name: '2K', sort: 2 }],
        qualities: [{ code: 'med', name: 'Medium', sort: 1 }],
        aspectRatios: [
          { code: 'auto', name: 'Auto', sort: 1 },
          { code: '1:1', name: '1:1', sort: 2 },
        ],
        pointPrices: [],
      })
    }
    if (path === '/api/ai/images/models') {
      state.modelRequests += 1
      state.modelHeaders.push(request.headers())
      if (options.legacyAutoTask) {
        return success([{
          code: 'nano-banana-2',
          name: 'Nano Banana 2',
          providerCode: 'google',
          sort: 1,
          sizeContractVersion: 'legacy-aspect-auto',
          resolutions: ['2k'],
          qualities: [],
          aspectRatios: ['auto', '1:1'],
          capabilities: {
            supportsReferenceImages: true,
            maxReferenceImages: 6,
            supportsQuality: false,
            supportedImageCounts: [1, 2, 3, 4],
          },
        }])
      }
      const explicitOnly = options.explicitOnly || autoRejected
      const catalogVersion = autoRejected ? 'imgcat_test_02' : 'imgcat_test_01'
      return success([{
        code: 'gpt-image-2',
        name: 'GPT Image 2',
        sort: 1,
        sizeContractVersion: 'size-mode-v1',
        catalogVersion,
        resolutions: options.fullResolutionCatalog ? ['4k', '1k', '2k'] : ['1k'],
        qualities: ['med'],
        aspectRatios: ['1:1'],
        capabilities: {
          supportsReferenceImages: true,
          maxReferenceImages: 6,
          supportsQuality: true,
          supportedImageCounts: [1, 2, 3, 4],
          sizeModes: explicitOnly ? ['explicit'] : ['explicit', 'auto'],
          defaultSizeMode: 'explicit',
          supportsAutoSize: !explicitOnly,
        },
      }])
    }
    if (path === '/api/ai/images/pricing-options') {
      if (options.legacyAutoTask) {
        return success([{
          modelCode: 'nano-banana-2',
          resolutionCode: '2k',
          qualityCode: '',
          points: 12,
          priceAmount: 1.2,
          priceMinorUnits: 120,
          currency: 'CNY',
          sort: 1,
        }])
      }
      const requestedCatalog = url.searchParams.get('catalogVersion') || ''
      const responseCatalog = options.catalogMismatch ? 'imgcat_wrong' : requestedCatalog
      const explicitOnly = options.explicitOnly || autoRejected
      return success({
        modelCode: 'gpt-image-2',
        catalogVersion: responseCatalog,
        items: [
          {
            modelCode: 'gpt-image-2',
            sizeMode: 'explicit',
            resolutionCode: '1k',
            qualityCode: 'med',
            points: 20,
            priceAmount: 2,
            priceMinorUnits: 200,
            currency: 'CNY',
            sort: 1,
          },
          ...(options.fullResolutionCatalog ? [
            {
              modelCode: 'gpt-image-2',
              sizeMode: 'explicit',
              resolutionCode: '2k',
              qualityCode: 'med',
              points: 30,
              priceAmount: 3,
              priceMinorUnits: 300,
              currency: 'CNY',
              sort: 2,
            },
            {
              modelCode: 'gpt-image-2',
              sizeMode: 'explicit',
              resolutionCode: '4k',
              qualityCode: 'med',
              points: 60,
              priceAmount: 6,
              priceMinorUnits: 600,
              currency: 'CNY',
              sort: 3,
            },
          ] : []),
          ...(!explicitOnly ? [{
            modelCode: 'gpt-image-2',
            sizeMode: 'auto',
            resolutionCode: null,
            qualityCode: 'med',
            points: 35,
            priceAmount: 3.5,
            priceMinorUnits: 350,
            currency: 'CNY',
            sort: 2,
          }] : []),
        ],
      })
    }
    if (path === '/api/ai/images' && method === 'POST') {
      state.generatedRequests.push(request.postDataJSON() as Record<string, unknown>)
      state.generationHeaders.push(request.headers())
      if (options.rejectAutoOnce && !autoRejected) {
        autoRejected = true
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'AUTO_SIZE_NOT_SUPPORTED', message: 'Auto disabled', requestId: 'req-auto-disabled' }),
        })
      }
      return success({ id: 99, taskId: 99, status: 'succeeded', url: imageUrl })
    }
    if (path === '/api/ai/images' && method === 'GET') {
      if (!options.galleryTask) return success({ items: [], total: 0, pageIndex: 1, pageSize: 100 })
      return success({ items: [imageRecord(options.galleryTask)], total: 1, pageIndex: 1, pageSize: 12 })
    }
    if (path === '/api/ai/images/99') return success(options.legacyAutoTask ? legacyAutoRecord() : imageRecord('succeeded-auto'))

    return success(null)
  })

  return state
}

function legacyAutoRecord() {
  return {
    ...imageRecord('succeeded-auto'),
    prompt: 'Reuse legacy Nano auto settings',
    modelName: 'Nano Banana 2',
    modelCode: 'nano-banana-2',
    pointCost: 12,
    sizeContractVersion: 'legacy-aspect-auto',
    sizeMode: 'auto',
    catalogVersion: null,
    requestedSize: 'auto',
    requestedResolutionCode: '2k',
    requestedAspectRatioCode: 'auto',
    resolutionCode: '2k',
    qualityCode: '',
    aspectRatioCode: 'auto',
  }
}

function imageRecord(state: 'queued-auto' | 'succeeded-auto') {
  const succeeded = state === 'succeeded-auto'
  return {
    id: 99,
    taskId: 99,
    siteId: 1,
    prompt: 'Auto-sized gallery image',
    modelName: 'GPT Image 2',
    modelCode: 'gpt-image-2',
    imageCount: 1,
    completedImageCount: succeeded ? 1 : 0,
    pointCost: 35,
    billingStatus: succeeded ? 1 : 0,
    sizeContractVersion: 'size-mode-v1',
    sizeMode: 'auto',
    catalogVersion: 'imgcat_test_01',
    requestedSize: 'auto',
    requestedResolutionCode: null,
    requestedAspectRatioCode: null,
    outputWidth: succeeded ? 1536 : null,
    outputHeight: succeeded ? 1024 : null,
    outputSize: succeeded ? '1536x1024' : null,
    resolutionCode: '',
    qualityCode: 'med',
    aspectRatioCode: 'auto',
    width: succeeded ? 1536 : 0,
    height: succeeded ? 1024 : 0,
    size: succeeded ? '1536x1024' : 'auto',
    quality: 'medium',
    referenceImageUrls: [],
    resultUrls: succeeded ? [imageUrl] : [],
    favoriteUrls: [],
    isFavorite: false,
    status: succeeded ? 'succeeded' : 'queued',
    createdAt: '2026-08-21T00:00:00Z',
  }
}

async function openPlayground(page: Page) {
  await page.goto('/playground')
  await expect(page.locator('.prompt-textarea textarea')).toBeVisible()
  await expect(page.locator('.prompt-panel .el-select').first()).toContainText('GPT Image 2')
}

test('submits size-mode-v1 auto without explicit size fields and sends client metadata', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const state = await mockBackend(page, { fullResolutionCatalog: true })
  await openPlayground(page)

  const resolutionField = page.locator('.el-form-item').filter({ hasText: '输出分辨率' })
  await expect(resolutionField.locator('.el-segmented__item-label')).toHaveText([
    '1K(快速预览)',
    '2K(推荐尺寸)',
    '4K(超清画质)',
  ])
  await page.getByText('自动尺寸', { exact: true }).click()
  await expect(page.getByText('输出分辨率', { exact: true })).toHaveCount(0)
  await expect(page.getByText('画幅比例', { exact: true })).toHaveCount(0)
  await expect(page.locator('.cost-hint')).toContainText('35')
  await page.locator('.prompt-textarea textarea').fill('Generate with automatic size')
  await expect(page.locator('button.generate')).toBeEnabled()
  await expect.poll(() => selectedSegmentBackgroundsAreAligned(page)).toBe(true)
  await page.screenshot({ path: 'test-results/ai-size-mode-desktop.png', fullPage: true })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => selectedSegmentBackgroundsAreAligned(page)).toBe(true)
  await page.screenshot({ path: 'test-results/ai-size-mode-mobile.png', fullPage: true })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0]).toMatchObject({
    modelCode: 'gpt-image-2',
    sizeMode: 'auto',
    catalogVersion: 'imgcat_test_01',
    qualityCode: 'med',
  })
  expect(state.generatedRequests[0]).not.toHaveProperty('resolutionCode')
  expect(state.generatedRequests[0]).not.toHaveProperty('aspectRatioCode')
  const storedDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('playgroundDraft') || '{}'))
  expect(storedDraft.draft).toMatchObject({
    sizeMode: 'auto',
    resolutionCode: '',
    aspectRatioCode: '',
  })
  expect(state.generationHeaders[0]['x-client-capabilities']).toBe('ai-size-mode-v1')
  expect(state.generationHeaders[0]['x-client-platform']).toBe('web')
  expect(state.generationHeaders[0]['x-client-version']).toBeTruthy()
  expect(state.generationHeaders[0]['x-client-build']).toBeTruthy()
  expect(state.modelHeaders[0]['x-client-capabilities']).toBe('ai-size-mode-v1')
})

function selectedSegmentBackgroundsAreAligned(page: Page) {
  return page.locator('.el-segmented__item-selected').evaluateAll((items) => items.every((item) => {
    const background = item.getBoundingClientRect()
    const selectedItem = item.closest('.el-segmented')?.querySelector('.el-segmented__item.is-selected')?.getBoundingClientRect()
    return Boolean(selectedItem)
      && Math.abs(background.left - selectedItem!.left) <= 1
      && Math.abs(background.right - selectedItem!.right) <= 1
  }))
}

test('migrates a version 1 GPT auto draft to legal explicit v2 state when auto is unavailable', async ({ page }) => {
  const state = await mockBackend(page, { explicitOnly: true })
  await page.addInitScript(() => {
    sessionStorage.setItem('playgroundDraft', JSON.stringify({
      version: 1,
      ownerUserId: 7,
      manualPrompt: 'Migrate this draft',
      draft: {
        prompt: 'Migrate this draft',
        modelCode: 'gpt-image-2',
        resolutionCode: '1k',
        qualityCode: 'med',
        aspectRatioCode: 'auto',
        imageCount: 1,
        references: [],
      },
    }))
  })
  await openPlayground(page)

  await expect(page.getByText('自动尺寸', { exact: true })).toHaveCount(0)
  await expect(page.getByText('输出分辨率', { exact: true })).toBeVisible()
  await expect.poll(async () => page.evaluate(() => JSON.parse(sessionStorage.getItem('playgroundDraft') || '{}').version)).toBe(2)
  const storedDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('playgroundDraft') || '{}'))
  expect(storedDraft.draft).toMatchObject({
    sizeContractVersion: 'size-mode-v1',
    sizeMode: 'explicit',
    catalogVersion: 'imgcat_test_01',
    aspectRatioCode: '1:1',
  })

  await page.locator('button.generate').click()
  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0]).toMatchObject({
    sizeMode: 'explicit',
    resolutionCode: '1k',
    aspectRatioCode: '1:1',
  })
})

test('fails closed when the pricing envelope catalog does not match the selected model', async ({ page }) => {
  const state = await mockBackend(page, { catalogMismatch: true })
  await openPlayground(page)

  await page.locator('.prompt-textarea textarea').fill('Do not submit against mixed catalogs')
  await expect(page.locator('button.generate')).toBeDisabled()
  await expect(page.getByText('当前参数的积分定价暂不可用，请重试或调整参数。', { exact: true })).toBeVisible()
  expect(state.generatedRequests).toHaveLength(0)
})

test('refreshes capabilities after AUTO_SIZE_NOT_SUPPORTED and preserves user input', async ({ page }) => {
  const state = await mockBackend(page, { rejectAutoOnce: true })
  await openPlayground(page)

  const prompt = 'Preserve this prompt while refreshing model capabilities'
  await page.getByText('自动尺寸', { exact: true }).click()
  await page.locator('.prompt-textarea textarea').fill(prompt)
  await page.locator('button.generate').click()

  await expect(page.locator('.el-message__content')).toContainText('当前模型已不支持自动尺寸')
  await expect.poll(() => state.modelRequests).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.prompt-textarea textarea')).toHaveValue(prompt)
  await expect(page.getByText('自动尺寸', { exact: true })).toHaveCount(0)
  await expect(page.getByText('输出分辨率', { exact: true })).toBeVisible()
  expect(state.generatedRequests).toHaveLength(1)
})

test('never displays 0x0 for auto tasks and shows decoded output dimensions after success', async ({ page }) => {
  await mockBackend(page, { galleryTask: 'queued-auto' })
  await page.goto('/images')

  await expect(page.locator('.image-card')).toContainText('自动尺寸，等待生成')
  await expect(page.getByText(/0x0/)).toHaveCount(0)

  await page.goto('/images/99/edit')
  await expect(page.getByText('1536x1024', { exact: true })).toBeVisible()
  await expect(page.getByText(/0x0/)).toHaveCount(0)
})

test('keeps legacy Nano auto resolution and aspect ratio when reusing a historical task', async ({ page }) => {
  const state = await mockBackend(page, { legacyAutoTask: true })
  await page.goto('/images/99/edit')

  await expect(page.getByText('2k / auto', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '复用配置', exact: true }).click()
  await expect(page).toHaveURL(/\/playground$/)
  await expect(page.locator('.cost-hint')).toContainText('12')
  await page.locator('button.generate').click()

  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0]).toMatchObject({
    modelCode: 'nano-banana-2',
    resolutionCode: '2k',
    aspectRatioCode: 'auto',
  })
  expect(state.generatedRequests[0]).not.toHaveProperty('sizeMode')
  expect(state.generatedRequests[0]).not.toHaveProperty('catalogVersion')
})
