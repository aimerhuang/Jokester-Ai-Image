export type ModelStatusState = 'normal' | 'degraded' | 'down' | 'unknown'

export interface ModelStatusItem {
  modelCode: string
  modelName: string
  state: ModelStatusState
  /** Rounded success percentage; null when state is unknown. */
  availability: number | null
  sampleCount: number
  fastestSuccessSeconds: number | null
  slowestSuccessSeconds: number | null
  /** Oldest to newest; 1 success, 0 failure. */
  recent: number[]
  /** UTC completion times aligned with `recent`. */
  recentCompletedAt: string[]
  lastSampleAt: string | null
}

export interface ModelStatusResponse {
  generatedAt: string
  windowHours: number
  sampleLimit: number
  items: ModelStatusItem[]
}

export type ModelRouteRole = 'primary' | 'fallback'
export type ModelRouteRequestFormat = 'openai-size' | 'prompt-aspect-ratio'

/** Admin view of a route. The API key is write-only: only a mask is ever returned. */
export interface ModelRoute {
  id: number
  revision: number
  modelCode: string
  modelName: string
  resolutionCode: string
  routeRole: ModelRouteRole
  provider: string
  providerProtocol: string | null
  providerModel: string
  baseUrl: string
  apiKeySet: boolean
  apiKeyMask: string | null
  apiKeyUpdatedAt: string | null
  textToImagePath: string
  imageToImagePath: string
  requestFormat: ModelRouteRequestFormat
  sort: number
  status: 0 | 1
  publishedCatalogVersions: string[]
  updatedAt: string | null
  updatedBy: string | null
}

export interface ModelRouteGroup {
  modelCode: string
  modelName: string
  state: ModelStatusState | null
  missingPrimaryRoute: boolean
  routes: ModelRoute[]
}

export interface ModelRouteQuery {
  keyword?: string
  status?: 0 | 1
}

export interface CreateModelRouteRequest {
  modelCode: string
  modelName?: string
  resolutionCode: string
  routeRole: ModelRouteRole
  provider: string
  providerModel: string
  baseUrl: string
  apiKey: string
  textToImagePath?: string
  imageToImagePath?: string
  requestFormat: ModelRouteRequestFormat
  sort: number
  status: 0 | 1
}

export interface UpdateModelRouteRequest {
  revision: number
  modelName: string
  providerModel: string
  baseUrl: string
  /** Empty keeps the current key. */
  apiKey?: string
  textToImagePath?: string
  imageToImagePath?: string
  requestFormat: ModelRouteRequestFormat
  sort: number
}

export interface UpdateModelRouteStatusRequest {
  revision: number
  status: 0 | 1
  confirmOffline?: boolean
}

export type ModelRouteProbeOutcome = 'passed' | 'auth_failed' | 'unreachable'

export interface ModelRouteProbeResult {
  result: ModelRouteProbeOutcome
  httpStatus: number | null
  elapsedMilliseconds: number
}

export type ModelRouteAuditAction = 'create' | 'update' | 'enable' | 'disable' | 'rotate_key'

export interface ModelRouteAudit {
  id: number
  configId: number
  modelCode: string
  resolutionCode: string
  routeRole: ModelRouteRole
  action: ModelRouteAuditAction
  changedFields: string[]
  beforeJson: string | null
  afterJson: string | null
  operatorUserId: number
  operatorUserName: string | null
  operatorIp: string | null
  createdAt: string
}

export interface ModelRouteAuditQuery {
  configId?: number
  page?: number
  pageSize?: number
}

export interface ModelRouteAuditPage {
  items: ModelRouteAudit[]
  total: number
  pageIndex: number
  pageSize: number
  hasMore?: boolean
}
