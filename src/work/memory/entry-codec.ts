import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { ensureDir } from '../../persistence/fs/paths.js'
import { readTextFileIfExists } from '../../persistence/fs/read-text.js'

import { type MemoryEntry } from './entry-types.js'
import {
  CANONICAL_HEADING_RE,
  ensureMemoryEntryId,
  HEADING_RE,
  normalizeCsv,
  normalizeInline,
  normalizeSource,
  normalizeText,
  normalizeUpdatedAt,
  parseMetaAndContent,
  truncateContent,
  truncateTitle,
} from './entry-utils.js'

const parseBlock = (heading: string, body: string): MemoryEntry | undefined => {
  const normalizedHeading = normalizeInline(heading)
  const canonical = normalizedHeading.match(CANONICAL_HEADING_RE)
  if (!canonical?.[1]) return undefined
  const parsed = parseMetaAndContent(body)

  const titleMeta = parsed.meta.get('title')
  const updatedAtMeta = parsed.meta.get('updated_at')
  const sourceMeta = parsed.meta.get('source')
  const categoryMeta = parsed.meta.get('category')
  const dedupeKeyMeta = parsed.meta.get('dedupe_key')
  const evidenceIds = normalizeCsv(parsed.meta.get('evidence_ids'))
  const focusHints = normalizeCsv(parsed.meta.get('focus_hints'))

  const content = truncateContent(parsed.content)
  const title = truncateTitle(normalizeInline(titleMeta ?? 'Memory'))
  if (!title && !content) return undefined

  const id = ensureMemoryEntryId(parsed.meta.get('id') ?? canonical[1])

  return {
    id,
    title: title || 'Memory',
    content,
    updatedAt: normalizeUpdatedAt(updatedAtMeta),
    source: normalizeSource(sourceMeta),
    ...(categoryMeta ? { category: normalizeInline(categoryMeta) } : {}),
    ...(dedupeKeyMeta ? { dedupeKey: normalizeInline(dedupeKeyMeta) } : {}),
    ...(evidenceIds ? { evidenceIds } : {}),
    ...(focusHints ? { focusHints } : {}),
  }
}

const findFirstNonCanonicalHeading = (markdown: string): string | undefined => {
  const source = markdown.replace(/\r\n/g, '\n')
  for (const line of source.split('\n')) {
    const heading = line.match(HEADING_RE)
    if (!heading?.[1]) continue
    if (CANONICAL_HEADING_RE.test(normalizeInline(heading[1]))) continue
    return heading[1]
  }
  return undefined
}

export const parseMemoryEntries = (markdown: string): MemoryEntry[] => {
  const source = markdown.replace(/\r\n/g, '\n')
  const lines = source.split('\n')
  const entries: MemoryEntry[] = []
  let currentHeading: string | undefined
  let buffer: string[] = []

  const flush = () => {
    if (!currentHeading) return
    const parsed = parseBlock(currentHeading, buffer.join('\n'))
    if (parsed) entries.push(parsed)
    currentHeading = undefined
    buffer = []
  }

  for (const line of lines) {
    const heading = line.match(HEADING_RE)
    if (heading?.[1]) {
      flush()
      currentHeading = heading[1]
      continue
    }
    if (!currentHeading && !line.trim()) continue
    buffer.push(line)
  }
  flush()
  return entries
}

const encodeEntry = (entry: MemoryEntry): string => {
  const lines = [
    `## [memory-entry] (id:${ensureMemoryEntryId(entry.id)})`,
    `title: ${normalizeInline(entry.title) || 'Memory'}`,
    `updated_at: ${normalizeUpdatedAt(entry.updatedAt)}`,
    `source: ${entry.source}`,
    ...(entry.category ? [`category: ${normalizeInline(entry.category)}`] : []),
    ...(entry.dedupeKey
      ? [`dedupe_key: ${normalizeInline(entry.dedupeKey)}`]
      : []),
    ...(entry.evidenceIds && entry.evidenceIds.length > 0
      ? [
          `evidence_ids: ${entry.evidenceIds.map((item) => normalizeInline(item)).join(', ')}`,
        ]
      : []),
    ...(entry.focusHints && entry.focusHints.length > 0
      ? [
          `focus_hints: ${entry.focusHints.map((item) => normalizeInline(item)).join(', ')}`,
        ]
      : []),
    '',
    truncateContent(normalizeText(entry.content)),
  ]
  return lines.join('\n').trimEnd()
}

export const formatMemoryEntriesMarkdown = (entries: MemoryEntry[]): string =>
  entries.length > 0 ? `${entries.map(encodeEntry).join('\n\n')}\n` : ''

export const readMemoryEntries = async (
  memoryPath: string,
): Promise<MemoryEntry[]> => {
  const markdown = await readTextFileIfExists(memoryPath)
  const invalidHeading = findFirstNonCanonicalHeading(markdown)
  if (invalidHeading)
    throw new Error(`memory heading format not supported: ${invalidHeading}`)
  return parseMemoryEntries(markdown)
}

export const writeMemoryEntries = async (
  memoryPath: string,
  entries: MemoryEntry[],
): Promise<void> => {
  await ensureDir(dirname(memoryPath))
  await writeFile(memoryPath, formatMemoryEntriesMarkdown(entries), {
    encoding: 'utf8',
  })
}
