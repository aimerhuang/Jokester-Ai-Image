import { http, noAuthRefreshReplayConfig } from './http'
import type { PageQuery, PageResult } from '@/types/api'
import type {
  CreditRecord,
  CreditSummary,
  IssuePointCodesRequest,
  IssuedPointCodesResult,
  PointPackageCode,
  PointBalanceResponse,
  RechargeOrder,
  RechargePackage,
  RechargePlatform,
  RedeemPointCodeResult,
  SignInResult,
  UserPointDetail,
} from '@/types/credits'

export async function getCreditSummary(): Promise<CreditSummary> {
  const result = await http.get<unknown, PointBalanceResponse>('/points/balance')
  return {
    balance: result.availablePoints,
    permanentPoints: result.permanentPoints,
    expiringPoints: result.expiringPoints,
    nextExpiringPoints: result.nextExpiringPoints ?? 0,
    nextExpireAt: result.nextExpireAt ?? null,
    checkedInToday: result.hasSignedInToday,
    todaySignInPoints: result.todaySignInPoints,
  }
}

export function signIn() {
  return http.post<unknown, SignInResult>('/points/sign-in', undefined, noAuthRefreshReplayConfig)
}

export async function getCreditRecords(params: PageQuery): Promise<PageResult<CreditRecord>> {
  const result = await http.get<unknown, PageResult<UserPointDetail>>('/points/details', { params })
  return {
    ...result,
    items: result.items.map((item) => ({
      id: item.id,
      type: item.source || item.changeType,
      source: item.source,
      changeType: item.changeType,
      amount: item.changePoints,
      description: item.remark || item.changeType,
      date: item.createdAt,
      balance: item.balanceAfter,
    })),
  }
}

export async function getRechargePackages(platform: RechargePlatform = 'web') {
  const packages = await http.get<unknown, RechargePackage[]>('/points/recharge/packages', {
    params: { platform },
  })
  return [...packages].sort((left, right) => left.sort - right.sort)
}

export function createRechargeOrder(packageCode: PointPackageCode) {
  return http.post<unknown, RechargeOrder>('/points/recharge/orders', { packageCode }, noAuthRefreshReplayConfig)
}

export function redeemPointCode(code: string) {
  return http.post<unknown, RedeemPointCodeResult>('/points/recharge/redeem', { code }, noAuthRefreshReplayConfig)
}

export function issuePointCodes(payload: IssuePointCodesRequest) {
  return http.post<unknown, IssuedPointCodesResult>('/points/recharge/admin/codes', payload, noAuthRefreshReplayConfig)
}
