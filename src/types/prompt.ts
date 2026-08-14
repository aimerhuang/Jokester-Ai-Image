import type { PageQuery } from '@/types/api'

export type PromptSearchField = 'all' | 'title' | 'prompt'
export type PromptEventType = 'detail_view' | 'copy' | 'use'

export interface PromptLibraryQuery extends PageQuery {
  keyword?: string
  searchField?: PromptSearchField
}

export interface PromptLibraryListItem {
  id: number
  title: string
  description: string
  promptPreview: string
  coverImageUrl?: string | null
  sourcePosition: number
}

export interface PromptLibraryDetail {
  id: number
  source: string
  externalNo: number
  externalOccurrence: number
  title: string
  description: string
  promptText: string
  coverImageUrl?: string | null
  authorName?: string | null
  authorUrl?: string | null
  sourceUrl?: string | null
  sourcePublishedAt?: string | null
  language?: string | null
  sourcePosition: number
}

export interface PromptEventResult {
  type: PromptEventType
  recorded: boolean
}
