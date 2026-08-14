export interface LegalDocument {
  version: string
  url: string
  effectiveAt: string
  requiresReconsent: boolean
}

export interface AiProcessingNotice extends LegalDocument {
  providerCodes: string[]
}

export interface CurrentLegalDocuments {
  privacyPolicy: LegalDocument
  termsOfService: LegalDocument
  aiProcessingNotice?: AiProcessingNotice | null
}

export interface UpdateAiProcessingConsentRequest {
  accepted: boolean
  documentVersion: string
  providerCodes: string[]
  clientPlatform: 'web'
}

export interface ConsentRecord {
  accepted: boolean
  documentVersion: string
  acceptedAt?: string | null
  revokedAt?: string | null
  providerCodes: string[]
  clientPlatform?: string | null
}
