import { expect, test, type Page } from 'playwright/test'

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174'
const promptText = 'Create a precise exploded-view poster with labeled components and a clean editorial layout.'
const coverPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0cAAAAASUVORK5CYII=',
  'base64',
)

const listItems = [
  {
    id: 1,
    title: 'Exploded View Poster',
    description: 'A structured product visualization.',
    promptPreview: promptText,
    coverImageUrl: '/prompt-images/youmind-gpt-image-2/1-test.png',
    sourcePosition: 1,
  },
  {
    id: 2,
    title: 'Blocked External Cover',
    description: 'The browser must not request this upstream image.',
    promptPreview: 'An external-cover safety check.',
    coverImageUrl: 'https://cms-assets.youmind.com/blocked.png',
    sourcePosition: 2,
  },
]

type MockState = {
  events: Array<{ id: number; type: string }>
  generatedRequests: Array<Record<string, unknown>>
  listQueries: URLSearchParams[]
  coverImageRequests: string[]
  upstreamImageRequests: string[]
}

async function mockBackend(page: Page): Promise<MockState> {
  const state: MockState = {
    events: [],
    generatedRequests: [],
    listQueries: [],
    coverImageRequests: [],
    upstreamImageRequests: [],
  }

  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'prompt-library-e2e-token')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Clipboard permission denied')) },
    })
    Object.defineProperty(Document.prototype, 'execCommand', {
      configurable: true,
      value(command: string) {
        if (command !== 'copy') return false
        const activeElement = document.activeElement
        ;(window as typeof window & { __copiedText?: string }).__copiedText = activeElement instanceof HTMLTextAreaElement
          ? activeElement.value
          : ''
        return true
      },
    })
  })

  page.on('request', (request) => {
    if (/youmind\.com|githubusercontent\.com|github\.com/i.test(request.url())) {
      state.upstreamImageRequests.push(request.url())
    }
  })

  await page.route('**/prompt-images/**', (route) => {
    state.coverImageRequests.push(route.request().url())
    if (state.coverImageRequests.length === 1) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>stale SPA fallback</title>',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: coverPng,
    })
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
      return success({ id: 7, userName: 'prompt-tester', nickName: 'Prompt Tester', pointBalance: 500 })
    }
    if (path === '/api/points/balance') {
      return success({ availablePoints: 500, hasSignedInToday: false, todaySignInPoints: 25 })
    }
    if (path === '/api/prompts' && method === 'GET') {
      state.listQueries.push(new URLSearchParams(url.search))
      return success({ total: listItems.length, pageIndex: 1, pageSize: 24, items: listItems })
    }

    const detailMatch = path.match(/^\/api\/prompts\/(\d+)$/)
    if (detailMatch && method === 'GET') {
      const id = Number(detailMatch[1])
      const item = listItems.find((candidate) => candidate.id === id) || listItems[0]
      return success({
        ...item,
        source: 'youmind-gpt-image-2',
        externalNo: id,
        externalOccurrence: 1,
        promptText: id === 1 ? promptText : item.promptPreview,
        authorName: 'YouMind OpenLab',
        authorUrl: null,
        sourceUrl: null,
        sourcePublishedAt: null,
        language: 'English',
      })
    }

    const eventMatch = path.match(/^\/api\/prompts\/(\d+)\/events$/)
    if (eventMatch && method === 'POST') {
      const body = request.postDataJSON() as { type: string }
      state.events.push({ id: Number(eventMatch[1]), type: body.type })
      return success({ type: body.type, recorded: true })
    }
    if (path === '/api/ai/images/parameters') {
      return success({
        resolutions: [{ code: '1k', name: '1K', sort: 1 }],
        qualities: [{ code: 'med', name: 'Medium', sort: 1 }],
        aspectRatios: [{ code: '1:1', name: '1:1', sort: 1 }],
        pointPrices: [],
      })
    }
    if (path === '/api/ai/images/models') {
      return success([{ code: 'gpt-image-2', name: 'GPT Image 2', sort: 1 }])
    }
    if (path === '/api/ai/images/pricing-options') return success([])
    if (path === '/api/ai/images' && method === 'POST') {
      state.generatedRequests.push(request.postDataJSON() as Record<string, unknown>)
      return success({ id: 99, status: 1, resultUrls: ['/ai-images/e2e-result.png'] })
    }

    return success(null)
  })

  return state
}

async function openLibrary(page: Page) {
  await page.goto(`${baseUrl}/prompts`, { waitUntil: 'networkidle' })
  await expect(page.locator('.prompt-card')).toHaveCount(2)
  await expect(page.locator('.prompt-card').first().locator('img')).toBeVisible()
  await expect(page.locator('.prompt-card').nth(1).getByText('封面暂不可用')).toBeVisible()
}

test.use({
  launchOptions: {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  },
})

test('prompt library search, copy, detail, and use workflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const state = await mockBackend(page)
  await openLibrary(page)
  expect(state.coverImageRequests).toHaveLength(2)
  expect(new URL(state.coverImageRequests[1]).searchParams.has('_coverRetry')).toBe(true)
  await page.screenshot({ path: 'test-results/prompt-library-desktop.png', fullPage: true })

  await page.getByPlaceholder('搜索标题、描述或提示词').fill('poster')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect.poll(() => state.listQueries.at(-1)?.get('keyword')).toBe('poster')

  await page.locator('.prompt-card').first().locator('.copy-action').click()
  await expect(page.getByText('提示词已复制')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __copiedText?: string }).__copiedText)).toBe(promptText)
  await expect.poll(() => state.events.some((event) => event.type === 'copy')).toBe(true)

  await page.locator('.prompt-card').first().getByRole('button', { name: '查看详情' }).click()
  await expect(page.locator('.prompt-detail-dialog')).toBeVisible()
  await expect(page.locator('.prompt-text')).toContainText(promptText)
  await expect.poll(() => state.events.some((event) => event.type === 'detail_view')).toBe(true)

  await page.locator('.prompt-detail-dialog .cover-image').click()
  await expect(page.locator('.el-image-viewer__wrapper')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.el-image-viewer__wrapper')).toBeHidden()

  await page.locator('.prompt-detail-dialog').getByRole('button', { name: '用于创作' }).click()
  await expect(page).toHaveURL(/\/playground$/)
  await expect(page.locator('.prompt-textarea textarea')).toHaveValue(promptText)
  await expect(page.locator('.prompt-panel .el-select').first()).toContainText('GPT Image 2')

  await page.getByRole('button', { name: '开始生成' }).click()
  await expect.poll(() => state.generatedRequests.length).toBe(1)
  expect(state.generatedRequests[0].sourcePromptId).toBe(1)
  expect(state.generatedRequests[0].prompt).toBe(promptText)
  expect(state.upstreamImageRequests).toEqual([])

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/prompt-library-workflow.png', fullPage: true })
})

test('prompt library mobile layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await mockBackend(page)
  await openLibrary(page)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  expect(state.upstreamImageRequests).toEqual([])
  await page.screenshot({ path: 'test-results/prompt-library-mobile.png', fullPage: true })
})
