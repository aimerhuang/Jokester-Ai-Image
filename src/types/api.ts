export interface ApiResponse<T> {
  code: number | string
  message: string
  data: T
}

export interface ApiError {
  code: number | string
  message: string
  status?: number
}

export interface PageResult<T> {
  items: T[]
  total: number
  pageIndex: number
  pageSize: number
}

export interface PageQuery {
  pageIndex?: number
  pageSize?: number
}
