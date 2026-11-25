import { expect, test, type Page } from 'playwright/test'

const accessToken = 'canvas-guide-e2e-token'
const canvasId = 'CNV20261124000000E2EGUIDE000001'
const newCanvasId = 'CNV20261124000000E2EGUIDE000002'
const screenshotDir = process.env.E2E_SCREENSHOT_DIR

type MockState = { created: number; deleted: string[]; detailRequests: string[] }

const emptyDocument = { schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 }, background: 'lines', nodes: [], connections: [] }

async function mockBackend(page: Page, theme: 'light' | 'dark' = 'light'): Promise<MockState> {
  const state: MockState = { created: 0, deleted: [], detailRequests: [] }
  const documents = new Map<string, Record<string, unknown>>()
  const revisions = new Map<string, number>()

  await page.addInitScript(([token, value]) => {
    localStorage.setItem('accessToken', token)
    localStorage.setItem('locale', 'zh-CN')
    localStorage.setItem('theme', value)
  }, [accessToken, theme])

  const detail = (id: string) => ({
    canvasId: id,
    title: id === canvasId ? '无限画布 2' : '无限画布 3',
    coverAssetId: null,
    coverUrl: null,
    storageBytes: 128,
    nodeCount: 0,
    connectionCount: 0,
    revision: revisions.get(id) ?? 1,
    createdAt: '2026-11-24T00:00:00Z',
    updatedAt: '2026-11-24T00:00:00Z',
    schemaVersion: 1,
    document: documents.get(id) ?? emptyDocument,
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
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
    if (path === '/api/ai/images/parameters') {
      return success({
        resolutions: [{ code: '1k', name: '1K', sort: 1 }],
        qualities: [{ code: 'low', name: 'Low', sort: 1 }],
        aspectRatios: [{ code: '1:1', name: '1:1', sort: 1 }],
        pointPrices: [],
      })
    }
    if (path === '/api/ai/images/models') {
      return success([{
        code: 'gpt-image-2',
        name: 'WxAi-image-2',
        sort: 1,
        resolutions: ['1k'],
        qualities: ['low'],
        aspectRatios: ['1:1'],
        capabilities: { supportsReferenceImages: true, maxReferenceImages: 6, supportsQuality: true, supportedImageCounts: [1] },
      }])
    }
    if (path === '/api/ai/images/pricing-options') return success([{ modelCode: 'gpt-image-2', resolutionCode: '1k', qualityCode: 'low', points: 10 }])
    if (path === '/api/ai/canvases' && method === 'GET') return success({ items: [], total: 0, pageIndex: 1, pageSize: 24, totalStorageBytes: 0 })
    if (path === '/api/ai/canvases' && method === 'POST') {
      state.created += 1
      return success(detail(newCanvasId))
    }
    const match = path.match(/^\/api\/ai\/canvases\/([^/]+)(\/document)?$/)
    if (match && !match[2] && method === 'GET') {
      state.detailRequests.push(match[1])
      return success(detail(match[1]))
    }
    if (match && !match[2] && method === 'DELETE') {
      state.deleted.push(match[1])
      return success(null)
    }
    if (match && match[2] && method === 'PUT') {
      const body = request.postDataJSON() as { document: Record<string, unknown> }
      const revision = (revisions.get(match[1]) ?? 1) + 1
      revisions.set(match[1], revision)
      documents.set(match[1], body.document)
      return success({ revision, updatedAt: '2026-11-24T00:00:01Z', storageBytes: 256, nodeCount: 0, connectionCount: 0 })
    }
    return success(null)
  })

  return state
}

async function snap(page: Page, name: string) {
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/${name}.png` })
}

test('empty canvas shows the start guide and each option works', async ({ page }) => {
  await mockBackend(page)
  await page.goto(`/canvas/${canvasId}`)

  const guide = page.getByTestId('canvas-empty-guide')
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('无限画布')
  await expect(guide).toContainText('从一个想法开始')
  await expect(guide).toContainText('生成图片、上传素材，或直接开始自由编排。')
  await snap(page, 'guide-light')

  // Bottom toolbar stays clickable while the guide is shown.
  await page.getByTestId('canvas-shortcuts').click()
  await expect(page.getByTestId('canvas-shortcut-panel')).toBeVisible()
  await page.getByTestId('canvas-shortcuts').click()

  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('canvas-empty-upload').click()
  await chooser

  await page.getByTestId('canvas-empty-generate').click()
  await expect(guide).toBeHidden()
  await expect(page.locator('.canvas-node')).toHaveCount(1)
})

test('blank option closes the guide without adding nodes', async ({ page }) => {
  await mockBackend(page)
  await page.goto(`/canvas/${canvasId}`)
  await page.getByTestId('canvas-empty-blank').click()
  await expect(page.getByTestId('canvas-empty-guide')).toBeHidden()
  await expect(page.locator('.canvas-node')).toHaveCount(0)
})

test('brand menu undoes, redoes, creates and deletes canvases', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto(`/canvas/${canvasId}`)
  await expect(page.locator('.title-input')).toHaveValue('无限画布 2')

  await page.getByTestId('canvas-brand-menu').click()
  await expect(page.getByTestId('canvas-menu-undo')).toHaveClass(/is-disabled/)
  await expect(page.getByTestId('canvas-menu-redo')).toHaveClass(/is-disabled/)
  await expect(page.getByTestId('canvas-menu-delete')).toHaveClass(/is-danger/)
  await snap(page, 'menu-light')
  await page.keyboard.press('Escape')

  await page.getByTestId('canvas-add-text').click()
  await expect(page.locator('.canvas-node')).toHaveCount(1)
  await page.waitForTimeout(600)

  await page.getByTestId('canvas-brand-menu').click()
  await page.getByTestId('canvas-menu-undo').click()
  await expect(page.locator('.canvas-node')).toHaveCount(0)
  await page.getByTestId('canvas-brand-menu').click()
  await page.getByTestId('canvas-menu-redo').click()
  await expect(page.locator('.canvas-node')).toHaveCount(1)

  await page.getByTestId('canvas-brand-menu').click()
  await page.getByTestId('canvas-menu-create').click()
  await expect(page).toHaveURL(new RegExp(`/canvas/${newCanvasId}$`))
  await expect(page.locator('.title-input')).toHaveValue('无限画布 3')
  await expect(page.getByTestId('canvas-empty-guide')).toBeVisible()
  expect(state.created).toBe(1)
  expect(state.detailRequests).toContain(newCanvasId)

  await page.getByTestId('canvas-brand-menu').click()
  await page.getByTestId('canvas-menu-delete').click()
  const dialog = page.locator('.el-message-box')
  await expect(dialog).toContainText('无限画布 3')
  await dialog.getByRole('button', { name: '取消' }).click()
  expect(state.deleted).toEqual([])

  await page.getByTestId('canvas-brand-menu').click()
  await page.getByTestId('canvas-menu-delete').click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除' }).click()
  await expect(page).toHaveURL(/\/canvas$/)
  expect(state.deleted).toEqual([newCanvasId])
})

test('brand menu returns home', async ({ page }) => {
  await mockBackend(page)
  await page.goto(`/canvas/${canvasId}`)
  await page.getByTestId('canvas-brand-menu').click()
  await page.getByTestId('canvas-menu-home').click()
  await expect(page).toHaveURL(/\/canvas$/)
})

test('guide and brand menu render in dark theme', async ({ page }) => {
  await mockBackend(page, 'dark')
  await page.goto(`/canvas/${canvasId}`)
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByTestId('canvas-empty-guide')).toBeVisible()
  await snap(page, 'guide-dark')
  await page.getByTestId('canvas-brand-menu').click()
  await expect(page.getByTestId('canvas-menu-home')).toBeVisible()
  await snap(page, 'menu-dark')
})
