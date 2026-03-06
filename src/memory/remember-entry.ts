import { createHash } from 'node:crypto'

import { nowIso } from '../shared/utils.js'
import { runSerialized } from '../storage/serialized-lock.js'

import { readMemoryEntries, writeMemoryEntries } from './entry-codec.js'
import { type MemoryEntry } from './entry-types.js'
import { truncateContent } from './entry-utils.js'

export type RememberMemoryInput = {
  content: string
}

export type RememberMemoryResult = {
  entryId: string
  ref: string
  category: string
  dedupeKey: string
  operation: 'created' | 'merged' | 'noop'
  contentChars: number
}

const DEFAULT_CATEGORY = 'general'
const DEFAULT_MAX_CHARS = 480

const normalizeText = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const deriveDedupeKey = (content: string): string => {
  const seed = content.slice(0, 72).trim().toLowerCase()
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 10)
  return `auto-${hash}`
}

const buildEntryId = (category: string, dedupeKey: string): string =>
  `memory-${createHash('sha1').update(`${category}:${dedupeKey}`).digest('hex').slice(0, 12)}`

const dedupeParagraphs = (value: string): string[] =>
  value
    .split(/\n{2,}/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 0)

const mergeContent = (
  existing: string,
  incoming: string,
): { content: string; changed: boolean } => {
  if (!existing) return { content: incoming, changed: incoming.length > 0 }
  if (!incoming) return { content: existing, changed: false }
  if (existing === incoming || existing.includes(incoming))
    return { content: existing, changed: false }

  const existingParts = dedupeParagraphs(existing)
  const existingSet = new Set(existingParts.map((part) => part.toLowerCase()))
  const incomingParts = dedupeParagraphs(incoming)
  const merged = [...existingParts]
  for (const part of incomingParts) {
    const key = part.toLowerCase()
    if (existingSet.has(key)) continue
    existingSet.add(key)
    merged.push(part)
  }
  const content = normalizeText(merged.join('\n\n'))
  return { content, changed: content !== existing }
}

const deriveTitle = (content: string): string => {
  const line = content.split(/\r?\n/).find((item) => item.trim().length > 0)
  const normalized = (line ?? 'Memory').replace(/\s+/g, ' ').trim()
  return normalized.length <= 80
    ? normalized
    : normalized.slice(0, 80).trimEnd()
}

const sortByUpdatedAtDesc = (entries: MemoryEntry[]): MemoryEntry[] =>
  [...entries].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt)
      return right.updatedAt.localeCompare(left.updatedAt)
    return left.id.localeCompare(right.id)
  })

export const rememberMemoryEntry = (
  memoryPath: string,
  input: RememberMemoryInput,
): Promise<RememberMemoryResult> =>
  runSerialized(memoryPath, async () => {
    const content = truncateContent(normalizeText(input.content)).slice(
      0,
      DEFAULT_MAX_CHARS,
    )
    const category = DEFAULT_CATEGORY
    const dedupeKey = deriveDedupeKey(content)
    const entryId = buildEntryId(category, dedupeKey)

    const entries = await readMemoryEntries(memoryPath)
    const index = entries.findIndex(
      (entry) => entry.category === category && entry.dedupeKey === dedupeKey,
    )
    if (index < 0) {
      const nextEntry: MemoryEntry = {
        id: entryId,
        title: deriveTitle(content),
        content,
        updatedAt: nowIso(),
        source: 'remember',
        category,
        dedupeKey,
      }
      const nextEntries = sortByUpdatedAtDesc([nextEntry, ...entries])
      await writeMemoryEntries(memoryPath, nextEntries)
      return {
        entryId,
        ref: `memory:entry:${entryId}`,
        category,
        dedupeKey,
        operation: 'created',
        contentChars: content.length,
      }
    }

    const current = entries[index]
    if (!current)
      throw new Error('remember_memory_entry_not_found_after_lookup')

    const merged = mergeContent(current.content, content)
    if (!merged.changed) {
      return {
        entryId: current.id,
        ref: `memory:entry:${current.id}`,
        category,
        dedupeKey,
        operation: 'noop',
        contentChars: content.length,
      }
    }

    const updated: MemoryEntry = {
      ...current,
      title: deriveTitle(merged.content),
      content: merged.content,
      source: 'remember',
      updatedAt: nowIso(),
    }
    const nextEntries = [...entries]
    nextEntries[index] = updated
    await writeMemoryEntries(memoryPath, sortByUpdatedAtDesc(nextEntries))

    return {
      entryId: updated.id,
      ref: `memory:entry:${updated.id}`,
      category,
      dedupeKey,
      operation: 'merged',
      contentChars: content.length,
    }
  })
