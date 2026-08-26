export interface ApiSuccessResponse<T> {
  code: 0
  message: string
  requestId?: string
  data: T
}

export interface ApiFailureResponse {
  code: string
  message: string
  requestId?: string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailureResponse

export interface ApiError {
  code: number | string
  message: string
  status?: number
  requestId?: string
  details?: unknown
  retryAfterSeconds?: number
}

export interface PageResult<T> {
  items: T[]
  total: number
  pageIndex: number
  pageSize: number
  hasMore?: boolean
}

export interface PageQuery {
  pageIndex?: number
  pageSize?: number
}
