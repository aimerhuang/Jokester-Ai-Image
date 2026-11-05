import { expect, test, type Page } from 'playwright/test'

const accessToken = 'canvas-e2e-token'
const canvasId = 'CNV20261103000000E2ECANVAS000001'
const uploadAssetId = 'AST20261103000000E2EUPLOAD00001'
const resultAssetId = 'AST20261103000000E2ERESULT00001'
const imagePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0cAAAAASUVORK5CYII=',
  'base64',
)

type CanvasMockOptions = {
  document?: Record<string, unknown>
  conflictOnFirstSave?: boolean
}

type CanvasMockState = {
  saves: Array<{ baseRevision: number; document: Record<string, unknown> }>
  createRequests: Array<Record<string, unknown>>
  registerRequests: Array<Record<string, unknown>>
  uploads: number
  taskPolls: number
  revision: number
}

const emptyDocument = { schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 }, background: 'lines', nodes: [], connections: [] }

async function mockBackend(page: Page, options: CanvasMockOptions = {}): Promise<CanvasMockState> {
  const state: CanvasMockState = { saves: [], createRequests: [], registerRequests: [], uploads: 0, taskPolls: 0, revision: 1 }
  let document = options.document || emptyDocument
  let conflictPending = Boolean(options.conflictOnFirstSave)

  await page.addInitScript((token) => {
    localStorage.setItem('accessToken', token)
    localStorage.setItem('locale', 'zh-CN')
  }, accessToken)

  const detail = () => ({
    canvasId,
    title: '无限画布 1',
    coverAssetId: null,
    coverUrl: null,
    storageBytes: 128,
    nodeCount: (document.nodes as unknown[]).length,
    connectionCount: (document.connections as unknown[]).length,
    revision: state.revision,
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    schemaVersion: 1,
    document,
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

    if (path === '/api/auth/profile') return success({ id: 7, userName: 'canvas-tester', nickName: 'Canvas Tester', pointBalance: 500 })
    if (path === '/api/points/balance') {
      return success({ availablePoints: 500, permanentPoints: 500, expiringPoints: 0, hasSignedInToday: true, todaySignInPoints: 0 })
    }
    if (path === '/api/points/details') return success({ items: [], total: 0, pageIndex: 1, pageSize: 20 })
    if (path === '/api/ai/images/parameters') {
      return success({
        resolutions: [{ code: '1k', name: '1K', sort: 1 }, { code: '2k', name: '2K', sort: 2 }],
        qualities: [{ code: 'low', name: 'Low', sort: 1 }, { code: 'med', name: 'Medium', sort: 2 }],
        aspectRatios: [{ code: '1:1', name: '1:1', sort: 1 }, { code: '16:9', name: '16:9', sort: 2 }],
        pointPrices: [],
      })
    }
    if (path === '/api/ai/images/models') {
      return success([{
        code: 'gpt-image-2',
        name: 'WxAi-image-2',
        sort: 1,
        resolutions: ['1k', '2k'],
        qualities: ['low', 'med'],
        aspectRatios: ['1:1', '16:9'],
        capabilities: { supportsReferenceImages: true, maxReferenceImages: 6, supportsQuality: true, supportedImageCounts: [1, 2, 3, 4] },
      }])
    }
    if (path === '/api/ai/images/pricing-options') {
      return success([
        { modelCode: 'gpt-image-2', resolutionCode: '1k', qualityCode: 'low', points: 10 },
        { modelCode: 'gpt-image-2', resolutionCode: '2k', qualityCode: 'low', points: 20 },
        { modelCode: 'gpt-image-2', resolutionCode: '2k', qualityCode: 'med', points: 30 },
      ])
    }
    if (path === '/api/ai/canvases' && method === 'GET') {
      return success({ items: [], total: 0, pageIndex: 1, pageSize: 24, totalStorageBytes: 0 })
    }
    if (path === '/api/ai/canvases' && method === 'POST') return success(detail())
    if (path === `/api/ai/canvases/${canvasId}` && method === 'GET') return success(detail())
    if (path === `/api/ai/canvases/${canvasId}/document` && method === 'PUT') {
      const body = request.postDataJSON() as { baseRevision: number; document: Record<string, unknown> }
      state.saves.push(body)
      if (conflictPending) {
        conflictPending = false
        state.revision = 5
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'CANVAS_REVISION_CONFLICT', message: 'conflict', details: { currentRevision: 5 } }),
        })
      }
      if (body.baseRevision !== state.revision) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'CANVAS_REVISION_CONFLICT', message: 'conflict', details: { currentRevision: state.revision } }),
        })
      }
      state.revision += 1
      document = body.document
      return success({ revision: state.revision, updatedAt: '2026-11-03T00:00:01Z', storageBytes: 256, nodeCount: 0, connectionCount: 0 })
    }
    if (path === '/api/ai/images' && method === 'POST') {
      state.createRequests.push(request.postDataJSON() as Record<string, unknown>)
      return success({ id: 501, taskId: 501, ids: [501], taskIds: [501], status: 'queued' })
    }
    if (path === '/api/ai/images' && method === 'GET') return success({ items: [], total: 0, pageIndex: 1, pageSize: 20 })
    if (path === '/api/ai/images/501') {
      state.taskPolls += 1
      return success({
        id: 501,
        taskId: 501,
        prompt: 'make it brighter',
        modelName: 'WxAi-image-2',
        status: 'succeeded',
        resultUrls: ['/api/media/ai/7/ai/result.png'],
      })
    }
    if (path === '/api/ai/images/upload' && method === 'POST') {
      state.uploads += 1
      const assetId = `AST20261103000000E2ECROP${String(state.uploads).padStart(7, '0')}`
      return success({ assetId, url: `/api/assets/${assetId}/content`, thumbnailUrl: `/api/assets/${assetId}/thumbnail`, fileName: 'crop.png', mimeType: 'image/png', fileSize: 68, width: 1, height: 1 })
    }
    if (path === '/api/assets/from-ai-result') {
      state.registerRequests.push(request.postDataJSON() as Record<string, unknown>)
      return success({ assetId: resultAssetId, url: `/api/assets/${resultAssetId}/content`, thumbnailUrl: `/api/assets/${resultAssetId}/thumbnail`, width: 1, height: 1 })
    }
    if (path.startsWith('/api/assets/') || path.startsWith('/api/media/ai/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: imagePng })
    }
    return success(null)
  })

  return state
}

function connectedDocument() {
  return {
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    background: 'lines',
    nodes: [
      { id: 'img_1', type: 'image', x: 40, y: 120, width: 276, height: 206, title: '参考图', data: { assetId: uploadAssetId } },
      { id: 'gen_1', type: 'generate', x: 460, y: 140, width: 276, height: 155, title: null, data: { prompt: '', modelCode: 'gpt-image-2', imageCount: 1, inputOrder: ['img_1'], runs: [], primaryResult: null } },
    ],
    connections: [{ id: 'e_1', from: 'img_1', to: 'gen_1' }],
  }
}

test('creates a canvas and autosaves new nodes with the current revision', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/canvas')
  await expect(page.getByText('画布素材 0 KB')).toBeVisible()

  await page.getByTestId('canvas-create').click()
  await expect(page).toHaveURL(new RegExp(`/canvas/${canvasId}$`))
  await page.getByTestId('canvas-add-text').click()

  await expect.poll(() => state.saves.length).toBeGreaterThan(0)
  expect(state.saves[0].baseRevision).toBe(1)
  const nodes = state.saves[0].document.nodes as Array<{ type: string }>
  expect(nodes.map((node) => node.type)).toEqual(['text'])
  await expect(page.getByTestId('canvas-save-status')).toContainText('已保存')
})

test('generates from a connected image and registers the result as the node output', async ({ page }) => {
  const state = await mockBackend(page, { document: connectedDocument() })
  await page.goto(`/canvas/${canvasId}`)

  await page.locator('[data-node-id="gen_1"]').click()
  const prompt = page.getByPlaceholder('描述你想要生成的画面内容，@引用素材')
  await expect(prompt).toBeVisible()
  await expect(page.locator('[data-node-id="img_1"]').getByText('图片1')).toBeVisible()
  await prompt.fill('使用图片1，让画面更明亮')
  const generate = page.getByRole('button', { name: /生成\s*\(20\)/ })
  await expect(generate).toBeEnabled()
  await generate.click()

  await expect.poll(() => state.createRequests.length).toBe(1)
  const created = state.createRequests[0]
  expect(created.referenceAssetIds).toEqual([uploadAssetId])
  expect(created.referenceImageUrls).toEqual([])
  expect(created.prompt).toBe('使用图片1，让画面更明亮')
  expect(created.resolutionCode).toBe('2k')
  expect(created.qualityCode).toBe('low')
  expect(created.aspectRatioCode).toBe('16:9')
  expect(typeof created.idempotencyKey).toBe('string')
  // The key is persisted in the document before the billed request is sent.
  const savedKeys = state.saves.map((save) => ((save.document.nodes as Array<{ id: string; data: { pendingIdempotencyKey?: string } }>)
    .find((node) => node.id === 'gen_1')?.data.pendingIdempotencyKey))
  expect(savedKeys).toContain(created.idempotencyKey)

  await expect.poll(() => state.registerRequests.length).toBe(1)
  expect(state.registerRequests[0]).toEqual({ taskId: 501, resultOrdinal: 0 })
  await expect.poll(() => state.saves.some((save) => (save.document.nodes as Array<{ id: string; data: { primaryResult?: { assetId?: string } } }>)
    .find((node) => node.id === 'gen_1')?.data.primaryResult?.assetId === resultAssetId)).toBe(true)
})

test('overwrites after a revision conflict using the server revision', async ({ page }) => {
  const state = await mockBackend(page, { conflictOnFirstSave: true })
  await page.goto(`/canvas/${canvasId}`)
  await page.getByTestId('canvas-add-text').click()

  await expect(page.getByText('画布已在其他地方更新').first()).toBeVisible()
  await page.getByRole('button', { name: '用当前内容覆盖' }).click()

  await expect.poll(() => state.saves.length).toBe(2)
  expect(state.saves[0].baseRevision).toBe(1)
  expect(state.saves[1].baseRevision).toBe(5)
  await expect(page.getByTestId('canvas-save-status')).toContainText('已保存')
})

test('image toolbar crops into a new asset node and prefills an upscale node', async ({ page }) => {
  const state = await mockBackend(page, { document: connectedDocument() })
  await page.goto(`/canvas/${canvasId}`)

  await page.locator('[data-node-id="img_1"]').click()
  await expect(page.getByRole('toolbar')).toBeVisible()
  await expect(page.getByTestId('canvas-image-tool-describe')).toBeDisabled()

  await page.getByTestId('canvas-image-tool-crop').click()
  await expect(page.locator('.edit-surface')).toBeVisible()
  await page.getByTestId('canvas-image-edit-confirm').click()
  await expect(page.locator('.edit-surface')).toHaveCount(0)
  expect(state.uploads).toBe(1)
  await expect(page.locator('[data-node-id]')).toHaveCount(3)

  await page.locator('[data-node-id="img_1"]').click()
  await page.getByTestId('canvas-image-tool-upscale').click()
  await expect(page.getByPlaceholder('描述你想要生成的画面内容，@引用素材')).toHaveValue(/^高清放大图片1/)
  await expect(page.locator('[data-node-id]')).toHaveCount(4)
  // img_1 now feeds gen_1, the cropped result (derived link) and the upscale node.
  await expect.poll(() => state.saves.some((save) => (save.document.connections as Array<{ from: string }>)
    .filter((edge) => edge.from === 'img_1').length === 3)).toBe(true)
})

test('slice links every tile back to its source and animates the source edges', async ({ page }) => {
  const state = await mockBackend(page, { document: connectedDocument() })
  await page.goto(`/canvas/${canvasId}`)

  await page.locator('[data-node-id="img_1"]').click()
  await page.getByTestId('canvas-image-tool-slice').click()
  await expect(page.locator('.edit-surface')).toBeVisible()
  await page.getByTestId('canvas-image-edit-confirm').click()
  await expect(page.locator('.edit-surface')).toHaveCount(0)
  expect(state.uploads).toBe(4)
  await expect(page.locator('[data-node-id]')).toHaveCount(6)

  await expect.poll(() => state.saves.some((save) => {
    const nodes = save.document.nodes as Array<{ id: string; type: string }>
    const connections = save.document.connections as Array<{ from: string; to: string }>
    const tiles = nodes.filter((node) => node.type === 'image' && node.id !== 'img_1')
    return tiles.length === 4 && tiles.every((tile) => connections.some((edge) => edge.from === 'img_1' && edge.to === tile.id))
  })).toBe(true)
  // The tiles start as one selected group.
  await expect(page.locator('.group-frame')).toHaveCount(1)
  await expect(page.getByTestId('canvas-ungroup')).toBeVisible()

  await page.locator('[data-node-id="img_1"]').click()
  await expect(page.locator('.connection-flow')).toHaveCount(5)
  await page.locator('[data-node-id="gen_1"]').click()
  await expect(page.locator('.connection-flow')).toHaveCount(0)
})

test('left drag box-selects instead of panning, and selected nodes can be grouped and ungrouped', async ({ page }) => {
  const state = await mockBackend(page, { document: connectedDocument() })
  await page.goto(`/canvas/${canvasId}`)

  const image = (await page.locator('[data-node-id="img_1"]').boundingBox())!
  const generate = (await page.locator('[data-node-id="gen_1"]').boundingBox())!
  const world = page.locator('.world')
  const before = await world.getAttribute('style')
  await page.mouse.move(image.x - 30, image.y - 60)
  await page.mouse.down()
  await page.mouse.move(generate.x + generate.width + 30, image.y + image.height + 30, { steps: 8 })
  await expect(page.locator('.marquee')).toBeVisible()
  await page.mouse.up()
  expect(await world.getAttribute('style')).toBe(before)

  await page.getByTestId('canvas-group').click()
  await expect(page.locator('.group-frame')).toHaveCount(1)
  await expect(page.getByTestId('canvas-ungroup')).toBeVisible()
  await expect.poll(() => state.saves.some((save) => {
    const nodes = save.document.nodes as Array<{ groupId?: string }>
    return nodes.length === 2 && Boolean(nodes[0].groupId) && nodes[0].groupId === nodes[1].groupId
  })).toBe(true)

  // Clicking empty canvas clears the selection; clicking a member selects the whole group; a second click picks the member.
  await page.mouse.click(generate.x + generate.width + 120, generate.y - 80)
  await expect(page.getByTestId('canvas-ungroup')).toHaveCount(0)
  await page.locator('[data-node-id="gen_1"]').click()
  await expect(page.getByTestId('canvas-ungroup')).toBeVisible()
  await page.locator('[data-node-id="gen_1"]').click()
  await expect(page.getByTestId('canvas-ungroup')).toHaveCount(0)
  await expect(page.getByPlaceholder('描述你想要生成的画面内容，@引用素材')).toBeVisible()

  await page.locator('.group-frame').click({ position: { x: 8, y: 8 } })
  await page.getByTestId('canvas-ungroup').click()
  await expect(page.locator('.group-frame')).toHaveCount(0)
  await expect.poll(() => {
    const last = state.saves.at(-1)?.document.nodes as Array<{ groupId?: string }> | undefined
    return Boolean(last && last.every((node) => !node.groupId))
  }).toBe(true)
})

test('minimap toggles from the corner controls and pans the viewport', async ({ page }) => {
  await mockBackend(page, { document: connectedDocument() })
  await page.addInitScript(() => localStorage.removeItem('canvasMinimapOpen'))
  await page.goto(`/canvas/${canvasId}`)

  await expect(page.getByTestId('canvas-minimap')).toHaveCount(0)
  await page.getByTestId('canvas-minimap-toggle').click()
  const minimap = page.getByTestId('canvas-minimap')
  await expect(minimap).toBeVisible()
  await expect(minimap.locator('.minimap-node')).toHaveCount(2)

  const world = page.locator('.world')
  const before = await world.getAttribute('style')
  const box = await minimap.locator('svg').boundingBox()
  await page.mouse.click(box!.x + 4, box!.y + 4)
  await expect.poll(() => world.getAttribute('style')).not.toBe(before)

  await page.getByTestId('canvas-minimap-toggle').click()
  await expect(minimap).toHaveCount(0)
})
