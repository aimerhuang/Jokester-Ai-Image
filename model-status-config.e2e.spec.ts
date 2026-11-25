import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'
const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR

type Route = Record<string, unknown> & { id: number; revision: number; status: 0 | 1 }

type MockState = {
  isSuperAdmin: boolean
  routes: Route[]
  statusRequests: Array<Record<string, unknown>>
  updateRequests: Array<Record<string, unknown>>
  testRequests: number[]
  createRequests: Array<Record<string, unknown>>
  conflictNextUpdate: boolean
  expireNextUpdate: boolean
  refreshRequests: number
}

function statusItems() {
  const now = Date.now()
  const times = (count: number) => Array.from({ length: count }, (_, index) => new Date(now - (count - index) * 60_000).toISOString())
  const normalRecent = Array.from({ length: 60 }, () => 1)
  const downRecent = [1, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1]
  return [
    {
      modelCode: 'gpt-image-2',
      modelName: 'WxAi-image-2',
      state: 'normal',
      availability: 100,
      sampleCount: 60,
      fastestSuccessSeconds: 29,
      slowestSuccessSeconds: 1553,
      recent: normalRecent,
      recentCompletedAt: times(60),
      lastSampleAt: new Date(now).toISOString(),
    },
    {
      modelCode: 'gpt-image-2.6-flare',
      modelName: 'WxAi-image-2.6-Flare-with-a-very-long-display-name',
      state: 'down',
      availability: 45,
      sampleCount: 11,
      fastestSuccessSeconds: 18,
      slowestSuccessSeconds: 66,
      recent: downRecent,
      recentCompletedAt: times(11),
      lastSampleAt: new Date(now).toISOString(),
    },
    {
      modelCode: 'gpt-image-2.6-sunburst',
      modelName: 'WxAi-image-2.6-Sunburst',
      state: 'degraded',
      availability: 89,
      sampleCount: 60,
      fastestSuccessSeconds: 30,
      slowestSuccessSeconds: 579,
      recent: Array.from({ length: 60 }, (_, index) => (index % 9 === 0 ? 0 : 1)),
      recentCompletedAt: times(60),
      lastSampleAt: new Date(now).toISOString(),
    },
    {
      modelCode: 'nano-banana-2',
      modelName: 'WxAi-Nana-2.1',
      state: 'unknown',
      availability: null,
      sampleCount: 3,
      fastestSuccessSeconds: null,
      slowestSuccessSeconds: null,
      recent: [1, 1, 0],
      recentCompletedAt: times(3),
      lastSampleAt: new Date(now).toISOString(),
    },
  ]
}

function initialRoutes(): Route[] {
  const base = {
    modelCode: 'gpt-image-2',
    modelName: 'WxAi-image-2',
    provider: 'openai',
    providerProtocol: 'openai-image',
    providerModel: 'gpt-image-2',
    gifProviderModel: null as string | null,
    apiKeySet: true,
    apiKeyMask: '••••a1B2',
    apiKeyUpdatedAt: '2026-11-20T03:12:00Z',
    textToImagePath: '/images/generations',
    imageToImagePath: '/images/edits',
    requestFormat: 'openai-size',
    sort: 1,
    updatedAt: '2026-11-20T03:12:00Z',
    updatedBy: 'admin',
  }
  return [
    { ...base, id: 11, revision: 3, resolutionCode: '1k', routeRole: 'primary', baseUrl: 'https://relay-primary.example.com/v1', status: 1, publishedCatalogVersions: [] },
    { ...base, id: 12, revision: 1, resolutionCode: '1k', routeRole: 'fallback', baseUrl: 'https://relay-backup.example.com/v1', status: 1, publishedCatalogVersions: ['gpt-image-2@2026-08-21'] },
  ]
}

async function mockBackend(page: Page, options: { isSuperAdmin: boolean }): Promise<MockState> {
  const state: MockState = {
    isSuperAdmin: options.isSuperAdmin,
    routes: initialRoutes(),
    statusRequests: [],
    updateRequests: [],
    testRequests: [],
    createRequests: [],
    conflictNextUpdate: false,
    expireNextUpdate: false,
    refreshRequests: 0,
  }
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'model-status-e2e-token')
    localStorage.setItem('refreshToken', 'model-status-e2e-refresh')
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
    const failure = (status: number, code: string, message: string, details?: unknown) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ code, message, requestId: 'e2e', details }),
    })

    if (path === '/api/auth/refresh' && method === 'POST') {
      state.refreshRequests += 1
      return success({ accessToken: `renewed-token-${state.refreshRequests}`, refreshToken: `renewed-refresh-${state.refreshRequests}` })
    }
    if (path === '/api/auth/profile') {
      return success({ id: 1, userName: 'admin', nickName: 'Admin', pointBalance: 100, isSuperAdmin: state.isSuperAdmin })
    }
    if (path === '/api/points/balance') {
      return success({ availablePoints: 100, permanentPoints: 100, expiringPoints: 0, nextExpiringPoints: 0, nextExpireAt: null, hasSignedInToday: true, todaySignInPoints: 0 })
    }
    if (path === '/api/ai/images/model-status') {
      return success({ generatedAt: new Date().toISOString(), windowHours: 24, sampleLimit: 60, items: statusItems() })
    }
    if (path === '/api/ai/images/parameters') {
      return success({ resolutions: [{ code: '4k', name: '4K', sort: 3 }, { code: '1k', name: '1K', sort: 1 }, { code: '2k', name: '2K', sort: 2 }], qualities: [], aspectRatios: [], pointPrices: [] })
    }
    if (!state.isSuperAdmin && path.startsWith('/api/ai/model-routes')) {
      return failure(403, 'RESOURCE_FORBIDDEN', 'forbidden')
    }
    if (path === '/api/ai/model-routes' && method === 'GET') {
      const codes = [...new Set(state.routes.map((item) => String(item.modelCode)))]
      return success(codes.map((code) => {
        const routes = state.routes.filter((item) => item.modelCode === code)
        return { modelCode: code, modelName: routes[0].modelName, state: code === 'gpt-image-2' ? 'normal' : null, missingPrimaryRoute: false, routes }
      }))
    }
    if (path === '/api/ai/model-routes' && method === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>
      state.createRequests.push(payload)
      const { apiKey: _apiKey, ...rest } = payload
      const created: Route = {
        ...rest, id: 90 + state.createRequests.length, revision: 1, status: payload.status as 0 | 1, providerProtocol: String(payload.provider),
        apiKeySet: true, apiKeyMask: '••••' + String(payload.apiKey).slice(-4), publishedCatalogVersions: [], updatedAt: new Date().toISOString(), updatedBy: 'admin',
      }
      state.routes.push(created)
      return success(created)
    }
    if (path === '/api/ai/model-routes/audits') {
      return success({ items: [], total: 0, pageIndex: 1, pageSize: 50 })
    }
    const statusMatch = path.match(/^\/api\/ai\/model-routes\/(\d+)\/status$/)
    if (statusMatch && method === 'PUT') {
      const payload = request.postDataJSON() as Record<string, unknown>
      state.statusRequests.push(payload)
      const target = state.routes.find((item) => item.id === Number(statusMatch[1]))!
      if (payload.status === 0 && !payload.confirmOffline) {
        return failure(409, 'MODEL_ROUTE_OFFLINE_CONFIRM_REQUIRED', 'confirm', { resolutionCodes: ['1k'] })
      }
      target.status = payload.status as 0 | 1
      target.revision += 1
      return success(target)
    }
    const testMatch = path.match(/^\/api\/ai\/model-routes\/(\d+)\/test$/)
    if (testMatch && method === 'POST') {
      state.testRequests.push(Number(testMatch[1]))
      return success({ result: 'auth_failed', httpStatus: 401, elapsedMilliseconds: 120 })
    }
    const updateMatch = path.match(/^\/api\/ai\/model-routes\/(\d+)$/)
    if (updateMatch && method === 'PUT') {
      const payload = request.postDataJSON() as Record<string, unknown>
      state.updateRequests.push(payload)
      if (state.expireNextUpdate) {
        state.expireNextUpdate = false
        return failure(401, 'ACCESS_TOKEN_EXPIRED', 'Access token has expired.')
      }
      if (state.conflictNextUpdate) {
        state.conflictNextUpdate = false
        return failure(409, 'MODEL_ROUTE_REVISION_CONFLICT', 'conflict')
      }
      const target = state.routes.find((item) => item.id === Number(updateMatch[1]))!
      Object.assign(target, {
        providerModel: payload.providerModel,
        baseUrl: payload.baseUrl,
        gifProviderModel: payload.gifProviderModel === undefined ? target.gifProviderModel : (payload.gifProviderModel || null),
        revision: target.revision + 1,
        apiKeyMask: payload.apiKey ? `••••${String(payload.apiKey).slice(-4)}` : target.apiKeyMask,
      })
      return success(target)
    }
    return success(null)
  })
  return state
}

function messageBox(page: Page, text: string) {
  return page.locator('.el-message-box').filter({ hasText: text })
}

test.describe('model status', () => {
  test('regular users see model status but not model config', async ({ page }) => {
    await mockBackend(page, { isSuperAdmin: false })
    await page.goto(`${baseUrl}/model-status`, { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: '模型状态', exact: true })).toBeVisible()
    await expect(page.locator('.primary-nav')).toContainText('模型状态')
    await expect(page.locator('.primary-nav')).not.toContainText('模型配置')

    const cards = page.locator('.status-card')
    await expect(cards).toHaveCount(4)
    const normal = cards.filter({ has: page.locator('[data-state="normal"]') })
    await expect(normal.locator('.model-status-badge')).toHaveText('正常')
    await expect(normal.getByTestId('model-availability')).toHaveText('100%')
    await expect(normal).toContainText('1553s')
    await expect(normal.locator('.recent-bar')).toHaveCount(60)

    const down = page.locator('.status-card[data-model-code="gpt-image-2.6-flare"]')
    await expect(down.locator('.model-status-badge')).toHaveText('异常')
    await expect(down).toContainText('近期成功率较低，暂不可用。')
    await expect(down.getByTestId('model-availability')).toHaveText('45%')
    await expect(down.locator('.recent-bar.failure')).toHaveCount(6)
    await expect(down.locator('.recent-bar').first()).toHaveAttribute('title', /^成功 · /)

    await expect(page.locator('.status-card[data-model-code="gpt-image-2.6-sunburst"] .model-status-badge')).toHaveText('波动')
    const unknown = page.locator('.status-card[data-model-code="nano-banana-2"]')
    await expect(unknown.locator('.model-status-badge')).toHaveText('暂无数据')
    await expect(unknown.getByTestId('model-availability')).toHaveText('—')

    await page.getByTestId('model-status-refresh').click()
    await expect(page.getByTestId('model-status-refresh')).toBeDisabled()
    if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/model-status.png`, fullPage: true })

    await page.goto(`${baseUrl}/admin/models`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/playground$/)
  })
})

test.describe('model config', () => {
  test('super admin edits routes without ever seeing a key', async ({ page }) => {
    const state = await mockBackend(page, { isSuperAdmin: true })
    await page.goto(`${baseUrl}/admin/models`, { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: '模型配置', exact: true })).toBeVisible()
    await expect(page.locator('.primary-nav')).toContainText('模型配置')
    await expect(page.getByTestId('route-key-mask')).toHaveText(['••••a1B2', '••••a1B2'])
    if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/model-config.png`, fullPage: true })

    // Published (frozen) route cannot be disabled from the UI.
    await expect(page.getByTestId('route-status-12')).toHaveClass(/is-disabled/)

    // Edit: rotate the key and change the endpoint; confirm the sensitive change.
    await page.getByTestId('route-edit-11').click()
    const form = page.getByTestId('model-route-form')
    await expect(form.getByTestId('route-api-key')).toHaveValue('')
    await expect(form.getByTestId('route-api-key')).toHaveAttribute('placeholder', /••••a1B2/)
    if (SCREENSHOT_DIR) {
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${SCREENSHOT_DIR}/model-route-dialog.png` })
    }
    await form.getByTestId('route-base-url').fill('https://relay-new.example.com/v1')
    await form.getByTestId('route-api-key').fill('sk-new-secret-9876')
    await page.getByTestId('route-save').click()
    await messageBox(page, '确认保存').getByRole('button', { name: '确认' }).click()
    await expect.poll(() => state.updateRequests.length).toBe(1)
    expect(state.updateRequests[0]).toMatchObject({ revision: 3, baseUrl: 'https://relay-new.example.com/v1', apiKey: 'sk-new-secret-9876' })

    // Offer to test after save; the probe result is shown, not the upstream body.
    await messageBox(page, '是否立即测试连接？').getByRole('button', { name: '立即测试' }).click()
    await expect.poll(() => state.testRequests).toEqual([11])
    await expect(page.locator('.el-message').filter({ hasText: '鉴权失败（HTTP 401）' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('sk-new-secret-9876')

    // Reopening the dialog never shows the key again.
    await page.getByTestId('route-edit-11').click()
    await expect(form.getByTestId('route-api-key')).toHaveValue('')
    await expect(form.getByTestId('route-api-key')).toHaveAttribute('placeholder', /••••9876/)

    // Revision conflict reloads the list and closes the dialog.
    state.conflictNextUpdate = true
    await form.getByTestId('route-provider-model').fill('gpt-image-2-renamed')
    await page.getByTestId('route-save').click()
    await messageBox(page, '确认保存').getByRole('button', { name: '确认' }).click()
    await expect(page.locator('.el-message').filter({ hasText: '配置已被他人修改' })).toBeVisible()
    await expect(page.getByTestId('model-route-form')).toBeHidden()

    // Disabling the last route asks for offline confirmation, then retries with confirmOffline.
    await page.getByTestId('route-status-11').click()
    await messageBox(page, '1K').getByRole('button', { name: '确认下线' }).click()
    await expect.poll(() => state.statusRequests.map((item) => item.confirmOffline)).toEqual([false, true])
    await expect(page.getByTestId('route-status-11')).not.toHaveClass(/is-checked/)
  })
})

test.describe('model config: new model', () => {
  test('super admin creates a new model with its primary route and is pointed at pricing', async ({ page }) => {
    const state = await mockBackend(page, { isSuperAdmin: true })
    await page.goto(`${baseUrl}/admin/models`, { waitUntil: 'networkidle' })

    await page.getByTestId('model-config-add-model').click()
    const dialog = page.locator('.model-route-dialog')
    await expect(dialog.locator('.el-dialog__title')).toHaveText('新增模型')
    const form = page.getByTestId('model-route-form')
    // The first route of a new model is always the primary route.
    await expect(form.locator('.el-radio-button.is-active')).toHaveText('主路由')
    await expect(form.locator('.el-radio-button.is-disabled')).toHaveCount(2)

    await form.getByTestId('route-model-code').fill('gpt-image-2')
    await form.getByTestId('route-model-name').fill('WxAi-image-3')
    await form.getByTestId('route-provider-model').fill('gpt-image-3')
    await form.getByTestId('route-base-url').fill('https://relay-new.example.com/v1')
    await form.getByTestId('route-api-key').fill('sk-new-model-4321')
    await page.getByTestId('route-save').click()
    await expect(form).toContainText('该模型编码已存在')
    expect(state.createRequests).toHaveLength(0)

    await form.getByTestId('route-model-code').fill('GPT Image 3')
    await page.getByTestId('route-save').click()
    await expect(form).toContainText('模型编码需为 2–100 位')

    await form.getByTestId('route-model-code').fill('GPT-Image-3')
    await page.getByTestId('route-save').click()
    await expect.poll(() => state.createRequests.length).toBe(1)
    expect(state.createRequests[0]).toMatchObject({
      modelCode: 'gpt-image-3', modelName: 'WxAi-image-3', routeRole: 'primary', provider: 'openai-image',
      providerModel: 'gpt-image-3', baseUrl: 'https://relay-new.example.com/v1', apiKey: 'sk-new-model-4321', status: 1,
    })

    await expect(page.locator('.model-group[data-model-code="gpt-image-3"] h2')).toHaveText('WxAi-image-3')
    await messageBox(page, '是否立即测试连接？').getByRole('button', { name: '稍后' }).click()
    await messageBox(page, '新模型需要在“生图定价”中配置价格').getByRole('button', { name: '去配置价格' }).click()
    await expect(page).toHaveURL(/\/admin\/pricing$/)
  })

  test('super admin turns GIF output on and off per route', async ({ page }) => {
    const state = await mockBackend(page, { isSuperAdmin: true })
    await page.goto(`${baseUrl}/admin/models`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('model-gif-tag')).toHaveCount(0)

    // GIF runs on the legacy queue, so a route frozen by a size-mode release can still change its GIF model.
    await page.getByTestId('route-edit-12').click()
    const form = page.getByTestId('model-route-form')
    const gifInput = form.getByTestId('route-gif-provider-model')
    await expect(gifInput).toBeEnabled()
    await expect(gifInput).toHaveValue('')
    await gifInput.fill('gpt-image-2-native')
    await page.getByTestId('route-save').click()
    await messageBox(page, '确认保存').getByRole('button', { name: '确认' }).click()
    await expect.poll(() => state.updateRequests.length).toBe(1)
    expect(state.updateRequests[0]).toMatchObject({ revision: 1, gifProviderModel: 'gpt-image-2-native' })
    await messageBox(page, '是否立即测试连接？').getByRole('button', { name: '稍后' }).click()
    await expect(page.getByTestId('route-gif-12')).toHaveText('GIF · gpt-image-2-native')
    await expect(page.getByTestId('model-gif-tag')).toHaveText('支持 GIF')

    // Clearing the field sends an empty string, which switches GIF off for the route.
    await page.getByTestId('route-edit-12').click()
    await expect(gifInput).toHaveValue('gpt-image-2-native')
    await gifInput.fill('')
    await page.getByTestId('route-save').click()
    await messageBox(page, '确认保存').getByRole('button', { name: '确认' }).click()
    await expect.poll(() => state.updateRequests.length).toBe(2)
    expect(state.updateRequests[1]).toMatchObject({ gifProviderModel: '' })
    await messageBox(page, '是否立即测试连接？').getByRole('button', { name: '稍后' }).click()
    await expect(page.getByTestId('route-gif-12')).toHaveCount(0)
    await expect(page.getByTestId('model-gif-tag')).toHaveCount(0)
  })

  test('an expired session on save is renewed without re-sending, and the user is asked to save again', async ({ page }) => {
    const state = await mockBackend(page, { isSuperAdmin: true })
    await page.goto(`${baseUrl}/admin/models`, { waitUntil: 'networkidle' })
    state.expireNextUpdate = true

    await page.getByTestId('route-edit-12').click()
    const form = page.getByTestId('model-route-form')
    await form.getByTestId('route-gif-provider-model').fill('gpt-image-2-native')
    await page.getByTestId('route-save').click()
    await messageBox(page, '确认保存').getByRole('button', { name: '确认' }).click()

    // The session is renewed, but the write is not replayed behind the user's back.
    await expect(page.locator('.el-message--warning')).toContainText('登录已自动续期，本次操作未提交，请再操作一次。')
    await expect(page.getByText('Access token has expired.')).toHaveCount(0)
    expect(state.refreshRequests).toBe(1)
    expect(state.updateRequests).toHaveLength(1)
    await expect(form).toBeVisible()
    await expect(form.getByTestId('route-gif-provider-model')).toHaveValue('gpt-image-2-native')

    // Saving again goes through with the renewed token.
    const retried = page.waitForRequest((request) => request.method() === 'PUT' && request.url().endsWith('/api/ai/model-routes/12'))
    await page.getByTestId('route-save').click()
    await messageBox(page, '确认保存').getByRole('button', { name: '确认' }).click()
    expect((await retried).headers().authorization).toBe('Bearer renewed-token-1')
    await expect.poll(() => state.updateRequests.length).toBe(2)
    await messageBox(page, '是否立即测试连接？').getByRole('button', { name: '稍后' }).click()
    await expect(page.getByTestId('route-gif-12')).toHaveText('GIF · gpt-image-2-native')
  })
})
