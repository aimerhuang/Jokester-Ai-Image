export interface ApiResponse<T> {
  code: number | string
  message: string
  requestId?: string
  data: T
}

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
