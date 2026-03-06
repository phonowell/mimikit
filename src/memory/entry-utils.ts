import { createHash } from 'node:crypto'

import { parseIsoMs } from '../shared/time.js'

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
export const LEGACY_REMEMBER_HEADING_RE =
  /^\[memory-entry:([a-z0-9._-]+):([a-z0-9._-]+)\]\s+\(id:(memory-[a-z0-9._-]+)\)$/i
export const LEGACY_TIMESTAMP_HEADING_RE =
  /^(.+?)\s+\((\d{4}-\d{2}-\d{2}T[^)]+)\)$/

const META_LINE_RE = /^([a-z_]+):\s*(.*)$/i

export const normalizeInline = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

export const normalizeText = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

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
} => {
  const trimmed = normalizeText(body)
  if (!trimmed) return { meta: new Map(), content: '' }
  const sections = trimmed.split(/\n{2,}/)
  const first = sections[0]
  if (!first) return { meta: new Map(), content: trimmed }
  const lines = first.split('\n').map((line) => line.trim())
  if (lines.length === 0 || lines.some((line) => !META_LINE_RE.test(line)))
    return { meta: new Map(), content: trimmed }
  const meta = new Map<string, string>()
  for (const line of lines) {
    const matched = line.match(META_LINE_RE)
    const key = matched?.[1]?.toLowerCase()
    if (!key) continue
    meta.set(key, matched?.[2]?.trim() ?? '')
  }
  return {
    meta,
    content: normalizeText(sections.slice(1).join('\n\n')),
  }
}

export const normalizeUpdatedAt = (value: string | undefined): string => {
  const raw = value?.trim()
  if (raw && parseIsoMs(raw) !== undefined) return raw
  return MEMORY_FALLBACK_UPDATED_AT
}
