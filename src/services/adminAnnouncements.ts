import { http, noAuthRefreshReplayConfig } from './http'
import type { AnnouncementCategory, AnnouncementDetail, AnnouncementItem } from './announcements'
import type { PageResult } from '@/types/api'

export type AnnouncementStatus = 0 | 1 | 2
export const announcementCategories: AnnouncementCategory[] = ['feature', 'activity', 'maintenance', 'notice']

export interface AdminAnnouncement extends AnnouncementItem {
  status: AnnouncementStatus
  revision: number
  createdBy: number
  createdByName?: string
  createdAt: string
  updatedBy?: number
  updatedByName?: string
  updatedAt?: string
}
export type AdminAnnouncementDetail = AdminAnnouncement & AnnouncementDetail
export interface AnnouncementFields {
  title: string
  summary: string
  content: string
  coverUrl: string
  category: AnnouncementCategory
  versionLabel: string
  isPinned: boolean
  isImportant: boolean
  linkUrl: string
  linkText: string
}
export function announcementFields(item?: AdminAnnouncementDetail): AnnouncementFields {
  return {
    title: item?.title ?? '', summary: item?.summary ?? '', content: item?.content ?? '',
    coverUrl: item?.coverUrl ?? '', category: item?.category ?? 'notice', versionLabel: item?.versionLabel ?? '',
    isPinned: item?.isPinned ?? false, isImportant: item?.isImportant ?? false,
    linkUrl: item?.linkUrl ?? '', linkText: item?.linkText ?? '',
  }
}
export interface CommunityFields {
  enabled: boolean
  title: string
  description: string
  groupName: string
  groupNumber: string
  joinUrl?: string
  remindIntervalDays: number
}
export interface AdminCommunity extends CommunityFields {
  promptVersion: number
  revision: number
  updatedBy?: number
  updatedByName?: string
  updatedAt?: string
}
const announcements = '/admin/announcements'
const community = '/admin/community/qq-group'
export const listAnnouncements = (params: { keyword?: string; status?: AnnouncementStatus; pageIndex: number; pageSize: number }, signal: AbortSignal) =>
  http.get<unknown, PageResult<AdminAnnouncement>>(announcements, { params, signal })
export const getAnnouncement = (id: number) => http.get<unknown, AdminAnnouncementDetail>(`${announcements}/${id}`)
export const createAnnouncement = (fields: AnnouncementFields, status: 0 | 1) =>
  http.post<unknown, AdminAnnouncementDetail>(announcements, { ...fields, status }, noAuthRefreshReplayConfig)
export const updateAnnouncement = (id: number, fields: AnnouncementFields, revision: number) =>
  http.put<unknown, AdminAnnouncementDetail>(`${announcements}/${id}`, { ...fields, revision }, noAuthRefreshReplayConfig)
export const setAnnouncementStatus = (id: number, status: 1 | 2, revision: number) =>
  http.put<unknown, AdminAnnouncementDetail>(`${announcements}/${id}/status`, { status, revision }, noAuthRefreshReplayConfig)
export const deleteAnnouncement = (id: number, revision: number) =>
  http.delete(`${announcements}/${id}`, { params: { revision }, ...noAuthRefreshReplayConfig })
export function uploadAnnouncementCover(file: File) {
  const form = new FormData()
  form.append('file', file)
  return http.post<unknown, { url: string }>(`${announcements}/images`, form, noAuthRefreshReplayConfig)
}
export const getCommunity = () => http.get<unknown, AdminCommunity>(community)
export const saveCommunity = (fields: CommunityFields, revision: number, bumpPromptVersion: boolean) =>
  http.put<unknown, AdminCommunity>(community, { ...fields, revision, bumpPromptVersion }, noAuthRefreshReplayConfig)
