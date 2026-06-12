import { http } from './http'
import type { PageQuery, PageResult } from '@/types/api'
import type { CreditRecord, CreditSummary, PointBalanceResponse, SignInResult } from '@/types/credits'

export async function getCreditSummary(userId?: string | number) {
  try {
    return await getPointBalance()
  } catch {
    if (!userId) return { balance: 0 } satisfies CreditSummary
    const result = await getCreditRecords(userId, { pageIndex: 1, pageSize: 1 })
    return { balance: result.items[0]?.balance ?? 0 } satisfies CreditSummary
  }
}

export async function getPointBalance() {
  const result = await http.get<unknown, PointBalanceResponse | number | null>('/points/balance')
  return normalizePointSummary(result)
}

export async function signIn() {
  const result = await http.post<unknown, SignInResult | PointBalanceResponse | number | null>('/points/sign-in')
  return normalizePointSummary(result)
}

export async function getCreditRecords(userId: string | number, params: PageQuery): Promise<PageResult<CreditRecord>> {
  const result = await http.get<unknown, unknown>(`/Users/${userId}/point-details`, { params })
  return normalizeCreditPage(result, params)
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

function normalizeCreditRecord(raw: unknown, index: number): CreditRecord {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const amount = toNumber(pick(record, ['amount', 'points', 'point', 'changePoints', 'changePoint', 'pointChange', 'changeAmount', 'value', 'credits', 'credit', '积分', '变动积分']))
  return {
    id: (pick(record, ['id', 'detailId', 'recordId', 'pointDetailId']) ?? index) as number | string,
    type: String(pick(record, ['type', 'pointType', 'changeType', 'category', 'businessType', 'source', 'typeName', 'typeDesc', '类型']) ?? ''),
    amount,
    description: (pick(record, ['description', 'remark', 'desc', 'note', 'detail', 'content', 'memo', '描述', '备注']) as string | undefined) ?? '',
    date: String(pick(record, ['date', 'createTime', 'createdAt', 'createdTime', 'createTimeStr', 'time', 'occurredAt', 'gmtCreate', '创建时间', '时间']) ?? ''),
    balance: toNumber(pick(record, ['balance', 'afterBalance', 'currentBalance', 'remainPoints', 'remainPoint', 'pointBalance', 'balanceAfter', '余额', '剩余积分']), amount),
  }
}

function normalizeCreditPage(result: unknown, params: PageQuery): PageResult<CreditRecord> {
  const pageIndex = params.pageIndex ?? 1
  const pageSize = params.pageSize ?? 10

  let container: Record<string, unknown> | unknown[] | null = null
  if (Array.isArray(result)) {
    container = result
  } else if (result && typeof result === 'object') {
    const payload = result as Record<string, unknown>
    const nested = payload.data ?? payload.result ?? payload.page
    container = (nested && typeof nested === 'object' ? nested : payload) as Record<string, unknown>
  }

  if (Array.isArray(container)) {
    const items = container.map(normalizeCreditRecord)
    return { items, total: items.length, pageIndex, pageSize }
  }

  const wrapper = (container ?? {}) as Record<string, unknown>
  const rawItems = pick(wrapper, ['items', 'list', 'records', 'rows', 'data', 'content']) ?? []
  const items = (Array.isArray(rawItems) ? rawItems : []).map(normalizeCreditRecord)
  const total = toNumber(pick(wrapper, ['total', 'totalCount', 'totalCounts', 'count', 'totalItems', 'totalRecords', 'recordsTotal']), items.length)
  return {
    items,
    total,
    pageIndex: toNumber(pick(wrapper, ['pageIndex', 'pageNum', 'pageNumber', 'currentPage', 'page']), pageIndex),
    pageSize: toNumber(pick(wrapper, ['pageSize', 'size', 'limit']), pageSize),
  }
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y' || normalized === '已签到'
  }
  return false
}

function unwrapPointSummary(result: PointBalanceResponse | SignInResult | number | null): PointBalanceResponse | SignInResult | number | null {
  if (!result || typeof result !== 'object') return result
  const payload = result as Record<string, unknown>
  const nested = payload.data ?? payload.result ?? payload.balanceInfo ?? payload.pointBalance
  if (nested && typeof nested === 'object') return nested as PointBalanceResponse | SignInResult
  return result
}

function normalizePointSummary(result: PointBalanceResponse | SignInResult | number | null): CreditSummary {
  const unwrapped = unwrapPointSummary(result)
  if (typeof unwrapped === 'number') return { balance: unwrapped }
  const data = unwrapped || {}
  return {
    balance: toNumber(
      data.balance
      ?? data.points
      ?? data.point
      ?? data.credits
      ?? data.credit
      ?? data.userPoints
      ?? data.currentPoints
      ?? data.totalPoints
      ?? data.pointBalance
      ?? data.currentPoint
      ?? data.availablePoints
      ?? data.pointTotal
      ?? data.score
      ?? (data as Record<string, unknown>)['当前积分']
      ?? (data as Record<string, unknown>)['积分'],
    ),
    checkedInToday: toBoolean(
      data.checkedInToday
      ?? data.isCheckedInToday
      ?? data.signedInToday
      ?? data.isSignedInToday
      ?? data.todayCheckedIn
      ?? data.hasSignedInToday
      ?? data.isSignIn
      ?? data.isSignedIn
      ?? data.signed
      ?? data.checkedIn
      ?? data.hasCheckIn
      ?? data.hasCheckedIn
      ?? (data as Record<string, unknown>)['是否已签到']
      ?? (data as Record<string, unknown>)['今日是否已签到']
      ?? (data as Record<string, unknown>)['已签到'],
    ),
  }
}
