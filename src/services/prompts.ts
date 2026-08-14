import { http } from './http'
import type { PageResult } from '@/types/api'
import type {
  PromptEventResult,
  PromptEventType,
  PromptLibraryDetail,
  PromptLibraryListItem,
  PromptLibraryQuery,
} from '@/types/prompt'

export function getPrompts(params: PromptLibraryQuery) {
  return http.get<unknown, PageResult<PromptLibraryListItem>>('/prompts', { params })
}

export function getPrompt(id: number) {
  return http.get<unknown, PromptLibraryDetail>(`/prompts/${id}`)
}

export function recordPromptEvent(id: number, type: PromptEventType) {
  return http.post<unknown, PromptEventResult>(`/prompts/${id}/events`, { type })
}
