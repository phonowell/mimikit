export type MemoryEntrySource = 'remember' | 'refresh' | 'unknown'

export type MemoryEntry = {
  id: string
  title: string
  content: string
  updatedAt: string
  source: MemoryEntrySource
  category?: string
  dedupeKey?: string
  evidenceIds?: string[]
  focusHints?: string[]
}

export const MEMORY_ENTRY_ID_PREFIX = 'memory-'

export const MEMORY_FALLBACK_UPDATED_AT = '1970-01-01T00:00:00.000Z'

export const MEMORY_SECTION_REF_PREFIX = 'memory:entry:'

export const MEMORY_STORAGE_MAX_BYTES = 64 * 1024

export const MEMORY_ENTRY_MAX_CONTENT_CHARS = 1_600

export const MEMORY_ENTRY_MAX_TITLE_CHARS = 120
