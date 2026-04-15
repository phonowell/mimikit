import { createHash } from 'node:crypto'

import {
  normalizeEntryInline,
  normalizeEntryText,
  parseEntryMetaAndContent,
} from '../../foundation/shared/markdown-entry.js'
import { parseIsoMs } from '../../foundation/shared/time.js'

import {
  MEMORY_ENTRY_ID_PREFIX,
  MEMORY_ENTRY_MAX_CONTENT_CHARS,
  MEMORY_ENTRY_MAX_TITLE_CHARS,
  MEMORY_FALLBACK_UPDATED_AT,
  type MemoryEntrySource,
} from './entry-types.js'

export const HEADING_RE = /^##\s+(.+)$/
export const CANONICAL_HEADING_RE =
  /^\[memory-entry\]\s+\(id:(memory-[a-z0-9._-]+)\)$/i

export const normalizeInline = (value: string): string =>
  normalizeEntryInline(value)

export const normalizeText = (value: string): string =>
  normalizeEntryText(value)

export const truncateTitle = (value: string): string =>
  value.length <= MEMORY_ENTRY_MAX_TITLE_CHARS
    ? value
    : value.slice(0, MEMORY_ENTRY_MAX_TITLE_CHARS).trimEnd()

export const truncateContent = (value: string): string =>
  value.length <= MEMORY_ENTRY_MAX_CONTENT_CHARS
    ? value
    : value.slice(0, MEMORY_ENTRY_MAX_CONTENT_CHARS).trimEnd()

export const normalizeSource = (
  value: string | undefined,
): MemoryEntrySource => {
  if (value === 'remember' || value === 'refresh') return value
  return 'unknown'
}

export const buildMemoryEntryId = (seed: string): string =>
  `${MEMORY_ENTRY_ID_PREFIX}${createHash('sha1').update(seed).digest('hex').slice(0, 12)}`

export const ensureMemoryEntryId = (value: string | undefined): string => {
  const normalized = value?.trim().toLowerCase()
  if (normalized?.startsWith(MEMORY_ENTRY_ID_PREFIX)) return normalized
  return buildMemoryEntryId(normalized ?? 'entry')
}

export const normalizeCsv = (
  value: string | undefined,
): string[] | undefined => {
  if (!value) return undefined
  const items = value
    .split(',')
    .map((item) => normalizeInline(item))
    .filter((item) => item.length > 0)
  return items.length > 0 ? items : undefined
}

export const parseMetaAndContent = (
  body: string,
): {
  meta: Map<string, string>
  content: string
} => parseEntryMetaAndContent(body)

export const normalizeUpdatedAt = (value: string | undefined): string => {
  const raw = value?.trim()
  if (raw && parseIsoMs(raw) !== undefined) return raw
  return MEMORY_FALLBACK_UPDATED_AT
}
