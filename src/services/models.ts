import { http, noAuthRefreshReplayConfig } from './http'
import type {
  CreateModelRouteRequest,
  ModelRoute,
  ModelRouteAuditPage,
  ModelRouteAuditQuery,
  ModelRouteGroup,
  ModelRouteProbeResult,
  ModelRouteQuery,
  ModelStatusResponse,
  UpdateModelRouteRequest,
  UpdateModelRouteStatusRequest,
} from '@/types/models'

/** Public model status for any signed-in user (served from a ~30s server snapshot). */
export function getModelStatus() {
  return http.get<unknown, ModelStatusResponse>('/ai/images/model-status')
}

// Super-administrator route management. Writes never auto-replay after a token refresh:
// a replayed create would conflict and a replayed edit would fail its revision check.

export function getModelRoutes(params: ModelRouteQuery = {}) {
  return http.get<unknown, ModelRouteGroup[]>('/ai/model-routes', { params })
}

export function getModelRoute(id: number) {
  return http.get<unknown, ModelRoute>(`/ai/model-routes/${id}`)
}

export function createModelRoute(payload: CreateModelRouteRequest) {
  return http.post<unknown, ModelRoute>('/ai/model-routes', payload, noAuthRefreshReplayConfig)
}

export function updateModelRoute(id: number, payload: UpdateModelRouteRequest) {
  return http.put<unknown, ModelRoute>(`/ai/model-routes/${id}`, payload, noAuthRefreshReplayConfig)
}

export function updateModelRouteStatus(id: number, payload: UpdateModelRouteStatusRequest) {
  return http.put<unknown, ModelRoute>(`/ai/model-routes/${id}/status`, payload, noAuthRefreshReplayConfig)
}

export function testModelRoute(id: number) {
  return http.post<unknown, ModelRouteProbeResult>(`/ai/model-routes/${id}/test`, undefined, noAuthRefreshReplayConfig)
}

export function getModelRouteAudits(params: ModelRouteAuditQuery = {}) {
  return http.get<unknown, ModelRouteAuditPage>('/ai/model-routes/audits', { params })
}
