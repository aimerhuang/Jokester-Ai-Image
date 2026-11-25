import { expect, test, type Page } from 'playwright/test'

const rates = {
  usdToCny: 6.6645, discountRate: 0.75, cnyPerPoint: 0.01,
  textInput: { officialUsdPerMillion: 5, platformCnyPerMillion: 25 },
  imageInput: { officialUsdPerMillion: 8, platformCnyPerMillion: 40 },
  output: { officialUsdPerMillion: 30, platformCnyPerMillion: 150 },
}
const resultUrl = '/api/media/ai/7/animation.gif'
const imageRecord = {
  id: 91, modelCode: 'studio', modelName: 'Studio', prompt: 'jump', imageCount: 1, qualityCode: 'low', aspectRatioCode: '1:1',
  status: 'succeeded', sizeContractVersion: 'legacy-explicit-v1', outputFormat: 'gif', frameCount: 9, frameDurationMs: 200,
  pointCost: 38, chargedPoints: 38, billingStatus: 1, pricingTier: 'gif_fixed', resultUrls: [resultUrl],
  usage: { inputBreakdown: 'unsplit', inputTokens: 26, textInputTokens: null, imageInputTokens: null, outputTokens: 439 },
  referenceImageUrls: [], favoriteUrls: [], createdAt: '2026-11-24T12:00:00Z',
}

async function open(page: Page, balance = 1000) {
  const state = { reserveBase: 2, requests: [] as Record<string, unknown>[], mediaAuth: [] as string[] }
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'gif-test')
    localStorage.setItem('locale', 'zh-CN')
  })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const ok = (data: unknown) => route.fulfill({ json: { code: 0, data } })
    if (path.endsWith('/auth/profile')) return ok({ id: 7, userName: 'tester', nickName: 'Tester', pointBalance: balance })
    if (path.endsWith('/points/balance')) return ok({ availablePoints: balance, permanentPoints: balance, expiringPoints: 0 })
    if (path.endsWith('/images/models')) {
      const gif = { frameCounts: [2, 4, 6, 8, 9, 10, 12], defaultFrameCount: 9, frameDurationsMs: [100, 200, 400, 800, 1000], defaultFrameDurationMs: 200,
        tokenPricing: rates, reserve: { basePoints: state.reserveBase, perFramePoints: { low: 4, med: 9, high: 12 }, perReferencePoints: 6 } }
      return ok(['studio', 'still'].map((code, sort) => ({ code, name: code === 'studio' ? 'Studio' : 'Still', sort,
        resolutions: ['1k'], qualities: ['low','med','high','max'], aspectRatios: ['1:1','16:9','auto'],
        capabilities: { supportsQuality: true, supportedImageCounts: [1,2,3,4], gif: code === 'studio' ? gif : null } })))
    }
    if (path.endsWith('/images/upload')) return ok({ assetId: 'ref-7', url: '/api/media/ai/7/input.png' })
    if (path.endsWith('/images/parameters')) return ok({ resolutions: [{ code: '1k' }], qualities: [{ code: 'low' }], aspectRatios: [{ code: '1:1' }], pointPrices: [] })
    if (path.endsWith('/images/pricing-options')) return ok(['studio','still'].map(modelCode => ({ modelCode, resolutionCode: '1k', qualityCode: 'low', points: 20, priceAmount: .2, currency: 'CNY' })))
    if (path === '/api/ai/images' && route.request().method() === 'POST') {
      state.requests.push(route.request().postDataJSON())
      return ok({ id: 91, status: 'succeeded', resultUrls: [resultUrl] })
    }
    if (path === '/api/ai/images') return ok({ items: [imageRecord], total: 1, pageIndex: 1, pageSize: 20 })
    if (path === '/api/ai/images/91') return ok(imageRecord)
    if (path === resultUrl) {
      state.mediaAuth.push(route.request().headers().authorization)
      return route.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAFAAAACwAAAAAAQABAAACAkQBACH5BAAUAAAALAAAAAABAAEAAAICTAEAOw==','base64') })
    }
    return ok([])
  })
  await page.goto('/playground')
  await expect(page.locator('.cost-hint')).toContainText('20')
  return state
}

const field = (page: Page, label: string) => page.locator('.el-form-item').filter({ has: page.locator('label', { hasText: label }) })
async function choose(page: Page, label: string, value: string) {
  await field(page, label).locator('.el-select').click()
  await page.getByRole('option', { name: value, exact: true }).click()
}

test('GIF 参数、固定价规则、草稿和按价格提交', async ({ page }) => {
  const state = await open(page)
  await page.getByText('GIF', { exact: true }).click()
  await expect(field(page, '分辨率')).toContainText('默认（由画面比例决定）')
  await expect(field(page, '分辨率').getByRole('combobox')).toBeDisabled()
  await expect(field(page, '帧数')).toContainText('9 帧（默认）')
  await expect(field(page, '每帧时长')).toContainText('200 ms（默认）')
  await field(page, '生成质量').locator('.el-select').click()
  await expect(page.getByRole('option')).toHaveText(['Low(快速/基础)', 'Medium(标准)', 'High(高精细)'])
  await page.keyboard.press('Escape')
  await expect(page.locator('.cost-hint')).toHaveText('本次预计消耗: 38')
  await expect(page.locator('button.generate')).toHaveText('开始生成')
  await page.getByRole('button', { name: '计费规则' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('基础 2 积分 + 每帧单价 × 帧数 + 每张参考图 6 积分')
  await expect(dialog.locator('.rate-card')).toHaveText([/Low.*每帧 4 积分/, /Medium.*每帧 9 积分/, /High.*每帧 12 积分/])
  await expect(dialog.locator('.price-table tbody tr').first().locator('td')).toHaveText(['10', '18', '26', '34', '38', '42', '50'])
  await expect(dialog.locator('.price-table td.active')).toHaveText('38')
  await expect(dialog.locator('.current')).toContainText('38 积分 / 个')
  await expect(dialog).not.toContainText('Token')
  await page.keyboard.press('Escape')
  await choose(page, '帧数', '4 帧')
  await choose(page, '每帧时长', '400 ms')
  await choose(page, '生成数量', '2张')
  await page.locator('textarea').fill('jump')
  await page.reload()
  await expect(field(page, '帧数')).toContainText('4 帧')
  await expect(field(page, '每帧时长')).toContainText('400 ms')
  await expect(page.locator('.cost-hint')).toContainText('36')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect.poll(() => state.requests.length).toBe(1)
  expect(state.requests[0]).toMatchObject({ outputFormat: 'gif', frameCount: 4, frameDurationMs: 400, imageCount: 2, expectedUnitPoints: 18, qualityCode: 'low', aspectRatioCode: '1:1' })
  for (const key of ['resolutionCode','sizeMode','catalogVersion']) expect(state.requests[0]).not.toHaveProperty(key)
  await expect(page.locator('.result-button img').first()).toHaveAttribute('src', /^blob:/)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.gif$/)
  expect(state.mediaAuth).toContain('Bearer gif-test')
})

test('切换普通模型后恢复 PNG 参数与报价', async ({ page }) => {
  const state = await open(page)
  await page.getByText('GIF', { exact: true }).click()
  await page.locator('.model-picker').click()
  await page.getByRole('option', { name: /Still/ }).click()
  await expect(page.getByText('GIF', { exact: true })).toHaveCount(0)
  await expect(field(page, '帧数')).toHaveCount(0)
  await expect(page.locator('.cost-hint')).toContainText('20')
  await page.locator('textarea').fill('still photo')
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests.length).toBe(1)
  expect(state.requests[0]).toMatchObject({ modelCode: 'still', resolutionCode: '1k', expectedUnitPoints: 20 })
  for (const key of ['outputFormat','frameCount','frameDurationMs']) expect(state.requests[0]).not.toHaveProperty(key)
})

test('同模型 GIF 价格上调需要重新确认', async ({ page }) => {
  const state = await open(page)
  await page.getByText('GIF', { exact: true }).click()
  await page.locator('textarea').fill('jump')
  state.reserveBase = 5
  await page.locator('button.generate').click()
  await expect(page.getByText(/GIF 价格已更新为每个 41/)).toBeVisible()
  expect(state.requests).toHaveLength(0)
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests.length).toBe(1)
  expect(state.requests[0].expectedUnitPoints).toBe(41)
})

test('作品与详情显示 GIF 积分、鉴权下载及 GIF 复用配置', async ({ page }) => {
  await open(page)
  await page.goto('/images')
  const card = page.locator('.image-card').first()
  await expect(card).toContainText('GIF')
  await expect(card).toContainText('任务积分: 38')
  await expect(card.locator('img')).toHaveAttribute('src', /^blob:/)
  await card.hover()
  const download = page.waitForEvent('download')
  await card.getByRole('button', { name: '下载' }).click()
  expect((await download).suggestedFilename()).toBe('image-91.gif')
  await page.goto('/images/91/edit')
  await expect(page.locator('.params-grid')).toContainText(/帧数9每帧时长200 ms任务积分38/)
  await expect(page.locator('.params-grid')).not.toContainText('Token')
  await page.getByRole('button', { name: '复用配置', exact: true }).click()
  await expect(field(page, '帧数')).toContainText('9 帧（默认）')
})

test('带参考图的 GIF 按整批价格比较余额，并提交素材 ID', async ({ page }) => {
  const state = await open(page, 400)
  await page.getByText('GIF', { exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'input.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0cAAAAASUVORK5CYII=', 'base64') })
  await expect(page.locator('.cost-hint')).toContainText('44')
  await choose(page, '生成数量', '4张')
  await choose(page, '生成质量', 'High(高精细)')
  await expect(page.locator('.cost-hint')).toContainText('464')
  await page.locator('textarea').fill('jump')
  await expect(page.locator('button.generate')).toBeDisabled()
  await choose(page, '生成数量', '1张')
  await page.locator('button.generate').click()
  await expect.poll(() => state.requests.length).toBe(1)
  expect(state.requests[0]).toMatchObject({ outputFormat: 'gif', expectedUnitPoints: 116, qualityCode: 'high', referenceAssetIds: ['ref-7'], referenceImageUrls: [] })
})
