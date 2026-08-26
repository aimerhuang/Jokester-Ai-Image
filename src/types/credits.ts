export interface CreditSummary {
  balance: number
  permanentPoints: number
  expiringPoints: number
  nextExpiringPoints: number
  nextExpireAt: string | null
  checkedInToday: boolean
  todaySignInPoints: number
}

export interface PointBalanceResponse {
  availablePoints: number
  permanentPoints: number
  expiringPoints: number
  nextExpiringPoints?: number | null
  nextExpireAt?: string | null
  hasSignedInToday: boolean
  todaySignInPoints: number
}

export interface SignInResult {
  points: number
  expireAt: string
  availablePoints: number
}

export interface UserPointDetail {
  id: number
  userId: number
  changePoints: number
  balanceAfter: number
  changeType: string
  source: string
  remark?: string | null
  createdAt: string
}

export interface CreditRecord {
  id: number
  type: string
  source: string
  changeType: string
  amount: number
  description: string
  date: string
  balance: number
}

export type PointPackageCode = 'monthly' | 'trial' | 'basic' | 'value'

export type RechargePlatform = 'web' | 'android' | 'ios'

export interface RechargePackage {
  code: PointPackageCode
  name: string
  description?: string | null
  points: number
  priceAmount: number
  priceMinorUnits: number
  currency: string
  validityDays?: number | null
  bonusPercent: number
  badgeCode?: string | null
  isFeatured: boolean
  isFirstPurchaseEligible: boolean
  purchaseEnabled: boolean
  benefits: string[]
  sort: number
  appleProductId?: string | null
}

export interface RechargeOrder {
  orderNo: string
  packageCode: PointPackageCode
  points: number
  priceAmount: number
  priceMinorUnits: number
  currency: string
  status: number
  purchaseUrl?: string | null
  expiresAt: string
  createdAt: string
}

export interface RedeemPointCodeResult {
  addedPoints: number
  availablePoints: number
  expiresAt?: string | null
  redeemedAt: string
}

interface IssuePointCodesRequestBase {
  count: number
  expiresAt?: string
}

export interface IssuePackagePointCodesRequest extends IssuePointCodesRequestBase {
  packageCode: PointPackageCode
  points?: never
  orderNo?: string
}

export interface IssueCustomPointCodesRequest extends IssuePointCodesRequestBase {
  points: number
  packageCode?: never
  orderNo?: never
}

export type IssuePointCodesRequest = IssuePackagePointCodesRequest | IssueCustomPointCodesRequest

export interface IssuedPointCodesResult {
  packageCode?: PointPackageCode | null
  points: number
  codes: string[]
}
