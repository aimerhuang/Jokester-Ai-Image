import { expect, test, type Page } from 'playwright/test'
import type { AdminAnnouncementDetail, AdminCommunity } from './src/services/adminAnnouncements'

const publishedAt = '2026-11-26T02:00:00Z'
const coverPath = '/site-media/announcement/202611/ffffffffffffffffffffffffffffffff.png'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jwZ8AAAAASUVORK5CYII=', 'base64')
function fixture() {
  let item: AdminAnnouncementDetail | undefined
  let group: AdminCommunity = { enabled: false, groupName: '', groupNumber: '', title: '加入 QQ 交流群', description: '分享作品', remindIntervalDays: 3, promptVersion: 1, revision: 0 }
  let uploaded = false
  async function connect(page: Page, isAdmin: boolean) {
    await page.addInitScript(() => { localStorage.setItem('accessToken', 'announcement-test'); localStorage.setItem('locale', 'zh-CN') })
    await page.route(`**${coverPath}`, route => route.fulfill({ body: png, contentType: 'image/png' }))
    await page.route('**/api/**', async route => {
      const req = route.request()
      const { pathname, searchParams } = new URL(req.url())
      const method = req.method()
      const ok = (data: unknown) => route.fulfill({ json: { code: 0, message: 'success', data } })
      const conflict = (code: string) => route.fulfill({ status: 409, json: { code, message: 'stale revision' } })
      const paged = (items: unknown[]) => ({ total: items.length, items, pageIndex: 1, pageSize: 20, hasMore: false })
      switch (pathname) {
        case '/api/auth/profile': return ok({ id: isAdmin ? 1 : 2, userName: isAdmin ? 'operator' : 'reader', pointBalance: 0, isSuperAdmin: isAdmin })
        case '/api/points/balance': return ok({ availablePoints: 0 })
        case '/api/community/qq-group': return ok(group.enabled ? group : { enabled: false })
        case '/api/announcements': return ok({ ...paged(item?.status === 1 ? [item] : []), latestPublishedAt: item?.status === 1 ? item.publishedAt : undefined })
        case '/api/admin/community/qq-group': {
          if (method === 'PUT') {
            const { revision, bumpPromptVersion, ...fields } = req.postDataJSON()
            if (revision !== group.revision) return conflict('COMMUNITY_SETTING_REVISION_CONFLICT')
            group = { ...group, ...fields, revision: revision + 1, promptVersion: group.promptVersion + Number(bumpPromptVersion), updatedByName: 'operator', updatedAt: publishedAt }
          }
          return ok(group)
        }
        case '/api/admin/announcements/images': {
          uploaded = req.headers()['content-type']?.startsWith('multipart/form-data') && req.postDataBuffer()?.includes('name="file"') || false
          return ok({ url: coverPath })
        }
        case '/api/admin/announcements': {
          if (method === 'POST') {
            const fields = req.postDataJSON()
            item = { ...fields, id: 1, revision: 0, createdBy: 1, createdByName: 'operator', createdAt: publishedAt, publishedAt: fields.status === 1 ? publishedAt : undefined }
            return ok(item)
          }
          return ok(paged(item ? [item] : []))
        }
        case '/api/admin/announcements/1':
        case '/api/admin/announcements/1/status': {
          if (method === 'GET') return ok(item)
          if (method === 'DELETE') {
            if (Number(searchParams.get('revision')) !== item?.revision) return conflict('ANNOUNCEMENT_REVISION_CONFLICT')
            item = undefined
            return ok(null)
          }
          const fields = req.postDataJSON()
          if (!item || fields.revision !== item.revision) return conflict('ANNOUNCEMENT_REVISION_CONFLICT')
          item = { ...item, ...fields, revision: item.revision + 1, updatedAt: publishedAt, updatedByName: 'operator' }
          if (item && item.status === 1) item.publishedAt ??= publishedAt
          return ok(item)
        }
        default: return ok({})
      }
    })
  }
  return { connect, item: () => item, group: () => group, uploaded: () => uploaded,
    editElsewhere() { if (item) { item.revision++; item.title = '另一位管理员的修改' } },
    changeGroupElsewhere() { group.revision++; group.groupName = '运营新群' },
  }
}

test('发布带封面的公告后普通用户刷新可见，下线后消失，可删除', async ({ page, browser, baseURL }) => {
  const state = fixture()
  await state.connect(page, true)
  const context = await browser.newContext({ baseURL })
  try {
    const reader = await context.newPage()
    await state.connect(reader, false)
    await reader.goto('/profile')
    await expect(reader.getByRole('button', { name: '更新公告', exact: true })).toBeVisible()
    await page.goto('/admin/announcements')
    await page.getByRole('button', { name: '新建公告' }).click()
    const editor = page.getByRole('dialog', { name: '新建公告' })
    await editor.getByRole('textbox', { name: '标题', exact: true }).fill('十一月功能更新')
    await editor.getByRole('textbox', { name: '摘要' }).fill('新的画布操作现已开放。')
    await editor.getByRole('textbox', { name: '正文' }).fill('作品可以直接加入画布。')
    await editor.locator('input[type=file]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png })
    await expect(editor.locator('.preview img')).toBeVisible()
    let finishUpload!: () => void
    const pendingUpload = new Promise<void>(resolve => { finishUpload = resolve })
    await page.route('**/api/admin/announcements/images', async route => {
      await pendingUpload
      await route.fallback()
    }, { times: 1 })
    const removeCover = editor.getByRole('button', { name: '移除封面' })
    try {
      await editor.locator('input[type=file]').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png })
      await expect(removeCover).toBeDisabled()
    } finally { finishUpload() }
    await expect(removeCover).toBeEnabled()
    await expect(editor.locator('.preview')).toContainText('十一月功能更新')
    await editor.getByRole('button', { name: '发布', exact: true }).click()
    await page.getByRole('button', { name: '确认', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: '十一月功能更新' })
    await expect(row).toContainText('已发布')
    await expect(row).toContainText('operator')
    expect(state.uploaded()).toBeTruthy()
    expect(state.item()?.coverUrl).toBe(coverPath)
    await reader.reload()
    await reader.getByRole('button', { name: '更新公告，有新内容' }).click()
    await expect(reader.getByRole('dialog')).toContainText('十一月功能更新')
    await expect(reader.locator('.notice-card img')).toBeVisible()
    await row.getByRole('button', { name: '置顶', exact: true }).click()
    await expect(row.getByRole('button', { name: '取消置顶' })).toBeVisible()
    expect(state.item()?.content).toBe('作品可以直接加入画布。')
    await row.getByRole('button', { name: '下线' }).click()
    await page.getByRole('button', { name: '确认' }).click()
    await expect(row).toContainText('已下线')
    await reader.reload()
    await reader.getByRole('button', { name: '更新公告', exact: true }).click()
    await expect(reader.getByRole('dialog')).toContainText('暂无公告')
    await row.getByRole('button', { name: '删除' }).click()
    await page.getByRole('button', { name: '确认' }).click()
    await expect(row).toHaveCount(0)
    expect(state.item()).toBeUndefined()
  } finally { await context.close() }
})

test('失效修订无法覆盖他人的公告', async ({ page }) => {
  const state = fixture()
  await state.connect(page, true)
  await page.goto('/admin/announcements')
  await page.getByRole('button', { name: '新建公告' }).click()
  const editor = page.getByRole('dialog')
  await editor.getByRole('textbox', { name: '标题', exact: true }).fill('草稿')
  await editor.getByRole('textbox', { name: '摘要' }).fill('编辑中')
  await editor.getByRole('button', { name: '保存草稿' }).click()
  await page.getByRole('button', { name: '编辑' }).click()
  await expect(editor.getByRole('textbox', { name: '标题', exact: true })).toHaveValue('草稿')
  state.editElsewhere()
  await editor.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByText('内容已被其他人修改', { exact: false })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '另一位管理员的修改' })).toBeVisible()
})

test('群号变更可选重新提醒，预览无副作用，保存后显示操作人并处理冲突', async ({ page }) => {
  const state = fixture()
  await state.connect(page, true)
  await page.goto('/admin/announcements')
  await page.getByRole('tab', { name: 'QQ 群弹窗' }).click()
  await expect(page).toHaveURL(/tab=qq-group/)
  await page.locator('.qq-settings .el-switch__core').click()
  await expect(page.getByRole('switch', { name: '启用弹窗' })).toBeChecked()
  await page.getByRole('textbox', { name: /群名$/ }).fill('创作交流群')
  await page.getByRole('textbox', { name: /群号$/ }).fill('9876543')
  const bump = page.getByRole('checkbox', { name: '重新提醒所有用户' })
  await expect(bump).toBeChecked()
  await page.getByText('重新提醒所有用户', { exact: true }).click()
  await expect(bump).not.toBeChecked()
  // Further edits to the number keep the admin's own choice.
  await page.getByRole('textbox', { name: /群号$/ }).fill('98765432')
  await expect(bump).not.toBeChecked()
  await page.getByRole('button', { name: '预览弹窗' }).click()
  const preview = page.getByRole('dialog', { name: '加入 QQ 交流群' })
  await expect(preview).toContainText('9876543')
  await preview.getByRole('button', { name: '稍后再说' }).click()
  await expect(preview).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('community.qqPrompt.1'))).toBeNull()
  expect(state.group().enabled).toBe(false)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.qq-settings')).toContainText('operator')
  expect(state.group().promptVersion).toBe(1)
  await page.getByText('重新提醒所有用户', { exact: true }).click()
  await expect(bump).toBeChecked()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(bump).not.toBeChecked()
  expect(state.group().promptVersion).toBe(2)
  state.changeGroupElsewhere()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('内容已被其他人修改', { exact: false })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /群名$/ })).toHaveValue('运营新群')
})
