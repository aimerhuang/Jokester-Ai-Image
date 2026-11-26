import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/app'
import type { ApiError } from '@/types/api'

export function useAnnouncementAdmin() {
  const app = useAppStore()
  const t = (key: string) => app.t(`announcementAdmin.${key}`)
  function date(value?: string) {
    return value ? new Date(value).toLocaleString(app.locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  }
  function report(error: unknown, reload: () => void) {
    const { code, message } = error as ApiError
    if (code === 'ANNOUNCEMENT_REVISION_CONFLICT' || code === 'COMMUNITY_SETTING_REVISION_CONFLICT') {
      ElMessage.warning(t('conflict'))
      reload()
    } else {
      ElMessage.error(message || t('failed'))
    }
  }
  async function confirm(action: string, message: string) {
    try {
      await ElMessageBox.confirm(t(message), t(action), {
        confirmButtonText: app.t('common.confirm'), cancelButtonText: app.t('common.cancel'), type: 'warning',
      })
      return true
    } catch { return false }
  }
  return { app, t, date, report, confirm }
}
