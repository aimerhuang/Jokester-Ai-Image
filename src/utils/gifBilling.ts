import type { GifCapability } from '@/types/image'

export function calculateReservePoints(reserve: GifCapability['reserve'], quality: string, frames: number, references: number) {
  const perFrame = reserve.perFramePoints[quality]
  if (!Number.isInteger(perFrame) || perFrame <= 0) return null
  return reserve.basePoints + perFrame * frames + reserve.perReferencePoints * references
}
