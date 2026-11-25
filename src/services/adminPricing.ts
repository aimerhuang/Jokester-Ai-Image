import { http, noAuthRefreshReplayConfig } from './http'
import type { PageResult } from '@/types/api'

export interface Slot {
  resolutionCode: string
  qualityCode: string
}
export interface Row extends Slot {
  id: number
  revision: number
  modelCode: string
  points: number
  vipPriceMode: 'follow' | 'manual'
  vipPoints: number | null
  priceAmount: number
  status: number
}
export interface Model {
  modelCode: string
  modelName: string
  providerProtocol: string
  sizeContractVersion: string
  enabledRouteCount: number
  accessLevel: 'all' | 'vip_only'
  vipDiscountPercent: number | null
  effectiveDiscountPercent: number
  revision: number
  prices: Row[]
  missingPrices: Slot[]
  releasePrices: { sizeMode: string; resolutionCode: string | null; qualityCode: string; points: number }[]
}
export interface Overview {
  defaultVipDiscountPercent: number
  largeChangePercent: number
  models: Model[]
}
export interface PreviewRow extends Slot {
  id: number
  modelCode: string
  oldVipPoints: number | null
  newVipPoints: number | null
}
export interface Preview {
  previewToken: string
  modelCount: number
  priceCount: number
  changes: PreviewRow[]
  manualPrices: PreviewRow[]
}
export interface Audit extends Partial<Slot> {
  id: number
  action: string
  batchId: string
  modelCode?: string
  targetType: string
  targetId: string
  beforeJson: string | null
  afterJson: string | null
  reason: string
  createdAt: string
  operatorUserId: number
  operatorUserName: string | null
}
export interface AuditQuery {
  modelCode?: string
  operatorUserId?: number
  changeType?: string
  startTime?: string
  endTime?: string
  pageIndex: number
  pageSize: number
}
const path = '/ai/model-pricing'
export const pricingAdmin = {
  read: () => http.get<unknown, Overview>(path),
  batch: (items: Row[], reason: string, confirmLargeChange: boolean, confirmDisableLastPrice: boolean) =>
    http.put(
      `${path}/prices/batch`,
      { items, reason, confirmLargeChange, confirmDisableLastPrice },
      noAuthRefreshReplayConfig,
    ),
  create: (slot: Slot, modelCode: string, points: number, priceAmount: number, reason: string) =>
    http.post(`${path}/prices`, { ...slot, modelCode, points, priceAmount, reason }, noAuthRefreshReplayConfig),
  preview: (modelCode: string | null, discountPercent: number | null) =>
    http.post<unknown, Preview>(`${path}/discount/preview`, { modelCode, discountPercent }),
  discount: (modelCode: string | null, discountPercent: number | null, previewToken: string, reason: string) =>
    http.put(
      `${path}/${modelCode ? `models/${encodeURIComponent(modelCode)}/` : ''}discount`,
      { discountPercent, previewToken, reason },
      noAuthRefreshReplayConfig,
    ),
  access: (model: Model, accessLevel: Model['accessLevel'], reason: string) =>
    http.put(
      `${path}/models/${encodeURIComponent(model.modelCode)}/access`,
      { accessLevel, revision: model.revision, reason },
      noAuthRefreshReplayConfig,
    ),
  audits: (params: AuditQuery) => http.get<unknown, PageResult<Audit>>(`${path}/audits`, { params }),
}
