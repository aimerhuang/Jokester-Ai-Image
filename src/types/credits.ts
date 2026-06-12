export interface CreditSummary {
  balance: number
  checkedInToday?: boolean
}

export interface PointBalanceResponse {
  balance?: number | string
  points?: number | string
  point?: number | string
  credits?: number | string
  credit?: number | string
  userPoints?: number | string
  currentPoints?: number | string
  totalPoints?: number | string
  pointBalance?: number | string
  currentPoint?: number | string
  availablePoints?: number | string
  pointTotal?: number | string
  score?: number | string
  checkedInToday?: boolean | number | string
  isCheckedInToday?: boolean | number | string
  signedInToday?: boolean | number | string
  isSignedInToday?: boolean | number | string
  todayCheckedIn?: boolean | number | string
  hasSignedInToday?: boolean | number | string
  isSignIn?: boolean | number | string
  isSignedIn?: boolean | number | string
  signed?: boolean | number | string
  checkedIn?: boolean | number | string
  hasCheckIn?: boolean | number | string
  hasCheckedIn?: boolean | number | string
}

export interface SignInResult extends PointBalanceResponse {
  rewardPoints?: number
  amount?: number
  message?: string
}

export interface CreditRecord {
  id: number | string
  type: string
  amount: number
  description?: string
  date: string
  balance?: number
}
