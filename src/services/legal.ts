import { http } from './http'
import type { Locale } from '@/types/app'
import type {
  ConsentRecord,
  CurrentLegalDocuments,
  UpdateAiProcessingConsentRequest,
} from '@/types/legal'

export function getCurrentLegalDocuments(locale: Locale) {
  return http.get<unknown, CurrentLegalDocuments>('/legal/documents/current', {
    params: { platform: 'web', locale },
  })
}

export function updateAiProcessingConsent(payload: UpdateAiProcessingConsentRequest) {
  return http.put<unknown, ConsentRecord>('/users/me/consents/ai-processing', payload)
}
