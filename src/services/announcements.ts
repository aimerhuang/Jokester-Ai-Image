import { http } from './http'
import type { PageResult } from '@/types/api'

export type AnnouncementCategory = 'feature' | 'activity' | 'maintenance' | 'notice'

export const announcementCategoryColors = { feature: 'success', activity: 'primary', maintenance: 'warning', notice: 'info' } as const

export interface AnnouncementItem {
  id: number
  title: string
  summary: string
  category: AnnouncementCategory
  coverUrl?: string
  versionLabel?: string
  isPinned: boolean
  isImportant: boolean
  hasDetail: boolean
  publishedAt?: string
}

export interface AnnouncementDetail extends AnnouncementItem {
  content?: string
  linkUrl?: string
  linkText?: string
}

export interface AnnouncementFeed extends PageResult<AnnouncementItem> {
  latestPublishedAt?: string
}

export interface QqGroupConfig {
  enabled: boolean
  promptVersion?: number
  title?: string
  description?: string
  groupName?: string
  groupNumber?: string
  joinUrl?: string
  remindIntervalDays?: number
}

export function getAnnouncements(pageIndex = 1) {
  return http.get<unknown, AnnouncementFeed>('/announcements', { params: { pageIndex, pageSize: 20 } })
}

export function getAnnouncement(id: number, signal: AbortSignal) {
  return http.get<unknown, AnnouncementDetail>(`/announcements/${id}`, { signal })
}

export function getQqGroup() {
  return http.get<unknown, QqGroupConfig>('/community/qq-group')
}
