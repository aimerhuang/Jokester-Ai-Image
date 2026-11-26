import { expect, test, type Page } from 'playwright/test'
import type { AnnouncementItem, QqGroupConfig } from './src/services/announcements'

const firstPublish = '2026-10-01T10:30:00Z'
const lastPublish = '2026-11-05T08:00:00.123456Z'
const richText = '第一行\n<script>window.executed = true</script>'
const groupConfig = {
  enabled: true, title: '创作交流群', description: '一起交流绘画技巧。', groupName: '绘画小组',
  groupNumber: '123456', promptVersion: 3, remindIntervalDays: 3, joinUrl: 'https://qm.qq.com/q/test-announcements',
}
const pinned: AnnouncementItem = { id: 10, title: '作品征集', summary: '来分享你的画作', category: 'activity',
  isPinned: true, isImportant: true, versionLabel: 'v2.6', publishedAt: firstPublish, hasDetail: true }
const newest: AnnouncementItem = { ...pinned, id: 20, title: '画布更新', isPinned: false, hasDetail: false, publishedAt: lastPublish }

async function mockNotices(page: Page) {
  const state = { group: { ...groupConfig } as QqGroupConfig, failConfig: false, failFeed: false,
    detailOffline: false, pages: [[pinned, newest]], userId: 7, groupCalls: 0 }
  await page.addInitScript(() => { localStorage.setItem('accessToken', 'notices-e2e') })
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    const ok = (data: unknown) => route.fulfill({ json: { code: 0, message: 'success', data } })
    const fail = (status: number) => route.fulfill({ status, json: { message: 'mock-service-unavailable' } })
    switch (url.pathname) {
      case '/api/auth/profile': return ok({ id: state.userId, userName: 'notices-user', isSuperAdmin: false, pointBalance: 12 })
      case '/api/points/balance': return ok({ availablePoints: 12 })
      case '/api/community/qq-group':
        state.groupCalls++
        return state.failConfig ? fail(500) : ok(state.group)
      case '/api/announcements': {
        if (state.failFeed) return fail(500)
        const pageIndex = Number(url.searchParams.get('pageIndex') || 1)
        return ok({ items: state.pages[pageIndex - 1], latestPublishedAt: lastPublish, pageIndex,
          pageSize: 20, total: state.pages.flat().length, hasMore: pageIndex < state.pages.length })
      }
      case '/api/announcements/10': return state.detailOffline ? fail(404) : ok({ ...pinned, content: richText, linkUrl: '/pricing', linkText: '查看价格' })
      default: return ok([])
    }
  })
  return state
}

const prompt = (page: Page) => page.getByRole('dialog', { name: groupConfig.title })
const bell = (page: Page) => page.getByRole('button', { name: /^更新公告/ })
const drawer = (page: Page) => page.getByRole('dialog', { name: '更新公告' })
async function expectPromptSkipped(page: Page) {
  await expect(bell(page)).toBeVisible()
  // Wait past the 800ms show delay after the list response has reached the page.
  await page.waitForTimeout(1000)
  await expect(prompt(page)).not.toBeVisible()
}
function readRecord(page: Page, userId = 7) {
  return page.evaluate(id => JSON.parse(localStorage.getItem(`community.qqPrompt.${id}`) || 'null'), userId)
}

test('群弹窗展示配置，稍后再说使用当前提醒间隔', async ({ page }) => {
  const state = await mockNotices(page)
  await page.goto('/profile')
  const dialog = prompt(page)
  await expect(dialog).toContainText(groupConfig.description)
  await expect(dialog).toContainText(groupConfig.groupName)
  await expect(dialog).toContainText(groupConfig.groupNumber)
  await page.mouse.click(4, 4)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '稍后再说' }).click()
  expect((await readRecord(page)).action).toBe('later')
  await page.reload()
  await expectPromptSkipped(page)
  await page.evaluate(() => {
    const key = 'community.qqPrompt.7'
    const record = JSON.parse(localStorage.getItem(key)!)
    localStorage.setItem(key, JSON.stringify({ ...record, at: Date.now() - 4 * 86_400_000 }))
  })
  state.group.remindIntervalDays = 5
  await page.reload()
  await expectPromptSkipped(page)
  state.group.remindIntervalDays = 3
  await page.reload()
  await expect(dialog).toBeVisible()
})

test('ESC 记录不再提醒，新版本和另一位用户仍收到提醒', async ({ page }) => {
  const state = await mockNotices(page)
  await page.goto('/profile')
  await prompt(page).getByText('不再提醒', { exact: true }).click()
  await expect(prompt(page).getByRole('checkbox')).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(prompt(page)).not.toBeVisible()
  expect((await readRecord(page)).action).toBe('never')
  await page.reload()
  await expectPromptSkipped(page)
  state.userId = 23
  await page.reload()
  await expect(prompt(page)).toBeVisible()
  expect(await readRecord(page, 23)).toBeNull()
  state.userId = 7
  state.group.promptVersion = 4
  state.group.groupNumber = '987654'
  await page.reload()
  await expect(prompt(page)).toContainText('987654')
})

test('复制成功保留弹窗，加入群在新标签页打开并存版本', async ({ page, context }) => {
  await mockNotices(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.route('https://qm.qq.com/**', route => route.fulfill({ body: 'QQ group preview' }))
  await page.goto('/profile')
  await prompt(page).getByRole('button', { name: '复制群号' }).click()
  await expect(page.getByText('群号已复制')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(groupConfig.groupNumber)
  expect(await readRecord(page)).toBeNull()
  const popup = context.waitForEvent('page')
  await prompt(page).getByRole('button', { name: '立即加入' }).click()
  await expect(await popup).toHaveURL(groupConfig.joinUrl)
  expect((await readRecord(page)).action).toBe('joined')
  await page.reload()
  await expectPromptSkipped(page)
})

test('无加群链接时主按钮复制并关闭', async ({ page, context }) => {
  const state = await mockNotices(page)
  delete state.group.joinUrl
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/profile')
  await prompt(page).getByRole('button', { name: '复制群号' }).click()
  await expect(prompt(page)).not.toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(groupConfig.groupNumber)
  expect((await readRecord(page)).action).toBe('joined')
})

test('配置接口失败不弹错，抽屉仍可查看；公告请求失败可单独重试', async ({ page }) => {
  const state = await mockNotices(page)
  state.failConfig = true
  await page.goto('/profile')
  await expectPromptSkipped(page)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await bell(page).click()
  await expect(drawer(page)).toContainText(pinned.title)
  await expect(drawer(page)).not.toContainText('官方 QQ 群')
  state.failConfig = false
  state.failFeed = true
  await page.reload()
  await prompt(page).getByRole('button', { name: '稍后再说' }).click()
  await bell(page).click()
  await expect(drawer(page)).toContainText('加载失败')
  state.failFeed = false
  await drawer(page).getByRole('button', { name: '重试' }).click()
  await expect(drawer(page)).toContainText(pinned.title)
})

test('铃铛按首次发布时间消红点；抽屉分页、纯文本和翻译保持一致', async ({ page }) => {
  const state = await mockNotices(page)
  state.group.enabled = false
  state.pages = [[pinned, newest], [{ ...newest, id: 21, title: '第二页' }]]
  await page.goto('/profile')
  await expect(bell(page)).toHaveAccessibleName('更新公告，有新内容')
  await expect(page.getByText(pinned.title)).toHaveCount(0)
  await bell(page).click()
  const list = drawer(page)
  await expect(list.locator('.notice-card').first()).toContainText(pinned.title)
  await expect(list.getByText('NEW', { exact: true })).toHaveCount(2)
  await list.getByRole('button', { name: '加载更多' }).click()
  await expect(list.locator('.notice-card')).toHaveCount(3)
  await list.getByRole('button', { name: /作品征集/ }).click()
  await expect(list.locator('.body-text')).toHaveText(richText)
  await expect(list.locator('.body-text')).toHaveCSS('white-space', 'pre-wrap')
  await expect(list.locator('.body-text script')).toHaveCount(0)
  await list.getByRole('button', { name: '返回列表' }).click()
  await page.keyboard.press('Escape')
  await expect(list).not.toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('announcements.lastSeenAt.7'))).toBe(lastPublish)
  state.pages[0] = [{ ...pinned, title: '更新了文案' }, newest]
  await page.reload()
  await expect(bell(page)).toHaveAccessibleName('更新公告')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Announcements', exact: true }).click()
  const english = page.getByRole('dialog', { name: 'Announcements' })
  await expect(english).toContainText('Event')
  await expect(english).toContainText('更新了文案')
  await expect(english.getByText('NEW', { exact: true })).toHaveCount(0)
  await page.evaluate(() => localStorage.setItem('announcements.lastSeenAt.7', '2026-11-05T08:00:00.123455Z'))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Announcements, new updates' })).toBeVisible()
})

test('重叠弹层跳过引导，详情下线会退回列表并刷新', async ({ page }) => {
  const state = await mockNotices(page)
  await page.goto('/profile')
  await bell(page).click()
  await expectPromptSkipped(page)
  await expect(drawer(page)).toContainText(groupConfig.groupNumber)
  state.detailOffline = true
  state.pages = [[newest]]
  await drawer(page).getByRole('button', { name: /作品征集/ }).click()
  await expect(page.getByText('公告已下线')).toBeVisible()
  await expect(drawer(page)).not.toContainText(pinned.title)
  await page.keyboard.press('Escape')
  await expect(prompt(page)).not.toBeVisible()
  expect(await readRecord(page)).toBeNull()
})

test('刷新时首页未变则保留已加载的分页，首页变化才回到最新列表', async ({ page }) => {
  const state = await mockNotices(page)
  state.group.enabled = false
  state.pages = [[pinned, newest], [{ ...newest, id: 21, title: '第二页' }]]
  await page.goto('/profile')
  await bell(page).click()
  const list = drawer(page)
  await list.getByRole('button', { name: '加载更多' }).click()
  await expect(list.locator('.notice-card')).toHaveCount(3)
  // An offline detail forces a list refresh while two pages are loaded.
  state.detailOffline = true
  const isFeed = (url: string) => new URL(url).pathname === '/api/announcements'
  let refreshed = page.waitForResponse(response => isFeed(response.url()))
  await list.getByRole('button', { name: /作品征集/ }).click()
  await refreshed
  await page.waitForTimeout(300)
  await expect(list.locator('.notice-card')).toHaveCount(3)
  await expect(list.getByText('第二页')).toBeVisible()
  state.pages = [[newest]]
  refreshed = page.waitForResponse(response => isFeed(response.url()))
  await list.getByRole('button', { name: /作品征集/ }).click()
  await refreshed
  await expect(list.locator('.notice-card')).toHaveCount(1)
  await expect(list).not.toContainText('第二页')
})

test('普通用户不能进入公告管理；独立画布和充值页不加载公告弹窗', async ({ page }) => {
  const state = await mockNotices(page)
  for (const path of ['/canvas/example', '/recharge']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(bell(page)).toHaveCount(0)
    await expect(prompt(page)).not.toBeVisible()
  }
  expect(state.groupCalls).toBe(0)
  await page.goto('/admin/announcements')
  await expect(page).toHaveURL(/\/playground$/)
  await expect(page.getByRole('link', { name: '公告管理' })).toHaveCount(0)
})

test('窄屏保留铃铛，空群号不弹；全宽抽屉滚动到底加载下一页', async ({ page }) => {
  const state = await mockNotices(page)
  state.group.groupNumber = ''
  state.pages = [Array.from({ length: 20 }, (_, index) => ({ ...newest, id: 20 - index, title: `公告 ${20 - index}` })),
    [{ ...newest, id: 21, title: '下一页公告' }]]
  await page.setViewportSize({ width: 480, height: 700 })
  await page.goto('/profile')
  await expectPromptSkipped(page)
  await bell(page).click()
  const list = drawer(page)
  await expect(list).toHaveCSS('width', '480px')
  await expect(list.locator('.notice-card')).toHaveCount(20)
  await list.locator('.scroll-area').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(list.locator('.notice-card')).toHaveCount(21)
  await expect(list.getByText('下一页公告')).toBeVisible()
  await expect(list).not.toContainText('官方 QQ 群')
})
