import { dirname } from 'node:path'

import write from 'fire-keeper/write'

import { ensureDir } from '../../fs/paths.js'
import { readTextFileIfExists } from '../../fs/read-text.js'
import { runSerialized } from '../../storage/serialized-lock.js'

import type { MemoryEvidenceEntry } from './types.js'

const MAX_ENTRY_TITLE_CHARS = 120
const MAX_ENTRY_CONTENT_CHARS = 1_600

const normalizeTitle = (value: string): string => {
  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) return 'Memory'
  return normalized.slice(0, MAX_ENTRY_TITLE_CHARS)
}

const normalizeContent = (value: string): string =>
  value.replace(/\r\n/g, '\n').trim().slice(0, MAX_ENTRY_CONTENT_CHARS)

const nowIso = (): string => new Date().toISOString()

const renderEntry = (entry: MemoryEvidenceEntry): string => {
  const title = normalizeTitle(entry.title)
  const content = normalizeContent(entry.content)
  return `## ${title} (${nowIso()})\n\n${content}`
}

const dedupeEntries = (
  current: string,
  entries: MemoryEvidenceEntry[],
): { rendered: string[]; skipped: number } => {
  const rendered: string[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const entry of entries) {
    const content = normalizeContent(entry.content)
    if (!content) {
      skipped += 1
      continue
    }
    if (seen.has(content) || current.includes(content)) {
      skipped += 1
      continue
    }
    seen.add(content)
    rendered.push(renderEntry(entry))
  }
  return { rendered, skipped }
}

const readCurrentMemory = async (path: string): Promise<string> =>
  readTextFileIfExists(path)

export const applyMemoryPatch = async (
  memoryPath: string,
  entries: MemoryEvidenceEntry[],
): Promise<{ written: number; skipped: number }> =>
  runSerialized(memoryPath, async () => {
    const current = await readCurrentMemory(memoryPath)
    const next = dedupeEntries(current, entries)
    if (next.rendered.length === 0) return { written: 0, skipped: next.skipped }
    const merged = current.trim()
      ? `${current.trimEnd()}\n\n${next.rendered.join('\n\n')}\n`
      : `${next.rendered.join('\n\n')}\n`
    await ensureDir(dirname(memoryPath))
    await write(memoryPath, merged, { encoding: 'utf8' }, { echo: false })
    return { written: next.rendered.length, skipped: next.skipped }
  })
