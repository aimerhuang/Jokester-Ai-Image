import zhCN from './zh-CN'
import enUS from './en-US'
import type { Locale } from '@/types/app'

export const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const

export type MessageKey = keyof typeof zhCN

export function getMessage(locale: Locale, path: string): string {
  const segments = path.split('.')
  let current: unknown = messages[locale]

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) return path
    current = (current as Record<string, unknown>)[segment]
  }

  return typeof current === 'string' ? current : path
}
