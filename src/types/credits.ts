export interface CreditSummary {
  balance: number
  checkedInToday: boolean
  todaySignInPoints: number
}

export interface PointBalanceResponse {
  availablePoints: number
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
  amount: number
  description: string
  date: string
  balance: number
}

export interface RechargePackage {
  code: string
  name: string
  description?: string | null
  points: number
  priceAmount: number
  currency: string
  validityDays?: number | null
  bonusPercent: number
  badgeCode?: string | null
  isFeatured: boolean
  isFirstPurchaseEligible: boolean
  purchaseEnabled: boolean
  benefits: string[]
}

export interface RechargeOrder {
  orderNo: string
  packageCode: string
  points: number
  priceAmount: number
  currency: string
  status: number
  purchaseUrl?: string | null
  expiresAt: string
  createdAt: string
}

export interface RedeemPointCodeResult {
  addedPoints: number
  availablePoints: number
  redeemedAt: string
}

export interface IssuePointCodesRequest {
  points: number
  count: number
  expiresAt?: string
}

export interface IssuedPointCodesResult {
  packageCode?: string | null
  points: number
  codes: string[]
}
