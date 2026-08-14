import { http } from './http'
import type { PageQuery, PageResult } from '@/types/api'
import type {
  CreditRecord,
  CreditSummary,
  IssuePointCodesRequest,
  IssuedPointCodesResult,
  PointBalanceResponse,
  RechargeOrder,
  RechargePackage,
  RedeemPointCodeResult,
  SignInResult,
  UserPointDetail,
} from '@/types/credits'

export async function getCreditSummary(): Promise<CreditSummary> {
  const result = await http.get<unknown, PointBalanceResponse>('/points/balance')
  return {
    balance: result.availablePoints,
    checkedInToday: result.hasSignedInToday,
    todaySignInPoints: result.todaySignInPoints,
  }
}

export async function signIn(): Promise<CreditSummary> {
  const result = await http.post<unknown, SignInResult>('/points/sign-in')
  return {
    balance: result.availablePoints,
    checkedInToday: true,
    todaySignInPoints: result.points,
  }
}

export async function getCreditRecords(userId: string | number, params: PageQuery): Promise<PageResult<CreditRecord>> {
  const result = await http.get<unknown, PageResult<UserPointDetail>>(`/users/${userId}/point-details`, { params })
  return {
    ...result,
    items: result.items.map((item) => ({
      id: item.id,
      type: item.source || item.changeType,
      amount: item.changePoints,
      description: item.remark || item.changeType,
      date: item.createdAt,
      balance: item.balanceAfter,
    })),
  }
}

export function getRechargePackages() {
  return http.get<unknown, RechargePackage[]>('/points/recharge/packages')
}

export function createRechargeOrder(packageCode: string) {
  return http.post<unknown, RechargeOrder>('/points/recharge/orders', { packageCode })
}

export function redeemPointCode(code: string) {
  return http.post<unknown, RedeemPointCodeResult>('/points/recharge/redeem', { code })
}

export function issuePointCodes(payload: IssuePointCodesRequest) {
  return http.post<unknown, IssuedPointCodesResult>('/points/recharge/admin/codes', payload)
}
