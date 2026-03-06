import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { ensureDir } from '../fs/paths.js'
import { readTextFileIfExists } from '../fs/read-text.js'
import { nowIso } from '../shared/utils.js'
import { runSerialized } from '../storage/serialized-lock.js'

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

const normalizeToken = (value: string, fallback: string): string => {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return token || fallback
}

const truncateContent = (value: string, maxChars: number): string => {
  const normalized = normalizeText(value)
  if (normalized.length <= maxChars) return normalized
  return normalized.slice(0, maxChars).trimEnd()
}

const deriveDedupeKey = (content: string): string => {
  const seed = content.slice(0, 72).trim().toLowerCase()
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 10)
  return `auto-${hash}`
}

const buildEntryId = (category: string, dedupeKey: string): string =>
  `memory-${createHash('sha1').update(`${category}:${dedupeKey}`).digest('hex').slice(0, 12)}`

const buildHeading = (params: {
  category: string
  dedupeKey: string
  entryId: string
}): string =>
  `## [memory-entry:${params.category}:${params.dedupeKey}] (id:${params.entryId})`

const parseContentFromBlock = (block: string): string => {
  const firstNewline = block.indexOf('\n')
  if (firstNewline < 0) return ''
  const body = block.slice(firstNewline + 1).trimStart()
  if (!body) return ''
  const sections = body.split(/\n{2,}/)
  const firstSection = sections[0] ?? ''
  const looksLikeMeta =
    sections.length > 1 &&
    firstSection
      .split('\n')
      .map((line) => line.trim())
      .every((line) => line.length > 0 && /^[a-z_]+:\s.+$/.test(line))
  const content = looksLikeMeta ? sections.slice(1).join('\n\n') : body
  return normalizeText(content)
}

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

const buildBlockBody = (content: string): string =>
  [`updated_at: ${nowIso()}`, '', content, ''].join('\n')

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type ManagedBlockRange = {
  start: number
  end: number
  block: string
}

const locateManagedBlock = (
  markdown: string,
  heading: string,
): ManagedBlockRange | undefined => {
  const withNewline = `${heading}\n`
  const fallbackStart = markdown.indexOf(heading)
  const start = markdown.indexOf(withNewline)
  if (start < 0 && fallbackStart < 0) return undefined
  const blockStart = start >= 0 ? start : fallbackStart
  const contentStart =
    start >= 0 ? blockStart + withNewline.length : blockStart + heading.length
  const tail = markdown.slice(contentStart)
  const nextHeadingMatch = /^##\s/m.exec(tail)
  const end =
    nextHeadingMatch?.index !== undefined
      ? contentStart + nextHeadingMatch.index
      : markdown.length
  return {
    start: blockStart,
    end,
    block: markdown.slice(blockStart, end),
  }
}

export const rememberMemoryEntry = (
  memoryPath: string,
  input: RememberMemoryInput,
): Promise<RememberMemoryResult> =>
  runSerialized(memoryPath, async () => {
    const content = truncateContent(input.content, DEFAULT_MAX_CHARS)
    const category = DEFAULT_CATEGORY
    const dedupeKey = normalizeToken(deriveDedupeKey(content), 'entry')
    const entryId = buildEntryId(category, dedupeKey)
    const headingPattern = new RegExp(
      `^## \\[memory-entry:${escapeRegex(category)}:${escapeRegex(dedupeKey)}\\] \\(id:(memory-[a-z0-9]+)\\)\\s*$`,
      'm',
    )
    const current = await readTextFileIfExists(memoryPath)
    const headingMatched = headingPattern.exec(current)
    const existingEntryId = headingMatched?.[1] ?? entryId
    const heading = buildHeading({
      category,
      dedupeKey,
      entryId: existingEntryId,
    })
    const matched = locateManagedBlock(current, heading)
    const existingBlock = matched?.block ?? ''
    const existingContent = existingBlock
      ? parseContentFromBlock(existingBlock)
      : ''
    const nextContent = mergeContent(existingContent, content)
    const operation: RememberMemoryResult['operation'] = !existingBlock
      ? 'created'
      : nextContent.changed
        ? 'merged'
        : 'noop'

    if (operation !== 'noop') {
      const block = `${heading}\n${buildBlockBody(nextContent.content)}`
      const next = matched
        ? `${current.slice(0, matched.start)}${block}${current.slice(matched.end)}`
        : current.trim()
          ? `${current.trimEnd()}\n\n${block}`
          : block
      await ensureDir(dirname(memoryPath))
      await writeFile(memoryPath, `${next.trimEnd()}\n`, { encoding: 'utf8' })
    }
    return {
      entryId: existingEntryId,
      ref: `memory:entry:${existingEntryId}`,
      category,
      dedupeKey,
      operation,
      contentChars: content.length,
    }
  })
