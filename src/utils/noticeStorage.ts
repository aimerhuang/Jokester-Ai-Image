import { ElMessage } from 'element-plus'
import type { QqGroupConfig } from '@/services/announcements'
import { useAppStore } from '@/stores/app'

export type QqAction = 'joined' | 'never' | 'later'
export interface QqPromptRecord { action: QqAction; at: number; promptVersion: number }

function read(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* The in-memory state still works in this tab. */ }
}

export function getQqPromptRecord(userId: number): QqPromptRecord | null {
  const value = read(`community.qqPrompt.${userId}`)
  if (!value) return null
  try {
    const record = JSON.parse(value)
    if (!record || !['joined', 'never', 'later'].includes(record.action)
      || !Number.isFinite(record.at) || !Number.isSafeInteger(record.promptVersion)) return null
    return record
  } catch { return null }
}

export function setQqPromptRecord(userId: number, record: QqPromptRecord) {
  write(`community.qqPrompt.${userId}`, JSON.stringify(record))
}

export function getLastSeen(userId: number) {
  const value = read(`announcements.lastSeenAt.${userId}`)
  return value && Number.isFinite(Date.parse(value)) ? value : null
}

export function setLastSeen(userId: number, latest: string) {
  write(`announcements.lastSeenAt.${userId}`, latest)
}

export function hasUnread(latest?: string | null, seen?: string | null) {
  if (!latest) return false
  if (!seen) return true
  const difference = Date.parse(latest) - Date.parse(seen)
  if (difference !== 0) return difference > 0
  // MySQL preserves microseconds. Date.parse only compares the first three fractional digits.
  const remainder = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? '').slice(3).padEnd(4, '0')
  return remainder(latest) > remainder(seen)
}

export function shouldShowQqPrompt(config: QqGroupConfig | null, record: QqPromptRecord | null, now: number) {
  if (!config?.enabled || !config.groupNumber || config.promptVersion == null) return false
  if (config.promptVersion !== record?.promptVersion) return true
  return record.action === 'later' && now - record.at >= (config.remindIntervalDays ?? 3) * 86_400_000
}

export async function copyGroupNumber(number: string) {
  const app = useAppStore()
  try {
    await navigator.clipboard.writeText(number)
    ElMessage.success(app.t('notices.copied'))
    return true
  } catch {
    ElMessage.info(`${app.t('notices.copyManually')} ${number}`)
    return false
  }
}
