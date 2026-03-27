export type ProjectProfileEntry = {
  id: string
  content: string
  sourceInputId: string
  sourceQuote: string
  updatedAt: string
}

export type RememberProjectProfileInput = {
  content: string
  sourceInputId: string
  sourceQuote: string
}

export type RememberProjectProfileResult = {
  entryId: string
  ref: string
  operation: 'created' | 'updated' | 'noop'
  contentChars: number
}

export const PROJECT_PROFILE_ENTRY_ID_PREFIX = 'project-profile-'
export const PROJECT_PROFILE_FALLBACK_UPDATED_AT = '1970-01-01T00:00:00.000Z'
