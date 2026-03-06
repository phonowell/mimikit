import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { ensureDir } from '../fs/paths.js'
import { readTextFileIfExists } from '../fs/read-text.js'
import { nowIso } from '../shared/utils.js'
import { runSerialized } from '../storage/serialized-lock.js'

export type RememberMemoryReplacePolicy = 'merge' | 'overwrite' | 'append'
export type RememberMemoryPriority = 'high' | 'normal' | 'low'
export type RememberMemorySource =
  | 'explicit_user_request'
  | 'repeated_user_signal'
  | 'agent_inference'

export type RememberMemoryInput = {
  content: string
  category?: string
  priority?: RememberMemoryPriority
  confidence?: number
  dedupeKey?: string
  replacePolicy?: RememberMemoryReplacePolicy
  source?: RememberMemorySource
  maxChars?: number
}

export type RememberMemoryResult = {
  entryId: string
  ref: string
  category: string
  dedupeKey: string
  operation: 'created' | 'merged' | 'overwritten' | 'appended' | 'noop'
  merged: boolean
  replaced: boolean
  truncated: boolean
  contentChars: number
}

const DEFAULT_CATEGORY = 'general'
const DEFAULT_MAX_CHARS = 480
const MIN_MAX_CHARS = 80
const MAX_MAX_CHARS = 2_000

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

const clampMaxChars = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CHARS
  const integer = Math.trunc(value as number)
  if (integer < MIN_MAX_CHARS) return MIN_MAX_CHARS
  if (integer > MAX_MAX_CHARS) return MAX_MAX_CHARS
  return integer
}

const truncateContent = (
  value: string,
  maxChars: number,
): { content: string; truncated: boolean } => {
  const normalized = normalizeText(value)
  if (normalized.length <= maxChars)
    return { content: normalized, truncated: false }
  return { content: normalized.slice(0, maxChars).trimEnd(), truncated: true }
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
  const split = body.indexOf('\n\n')
  if (split < 0) return ''
  return normalizeText(body.slice(split + 2))
}

const dedupeParagraphs = (value: string): string[] =>
  value
    .split(/\n{2,}/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 0)

const mergeContent = (
  existing: string,
  incoming: string,
  policy: RememberMemoryReplacePolicy,
): { content: string; changed: boolean } => {
  if (!existing) return { content: incoming, changed: incoming.length > 0 }
  if (!incoming) return { content: existing, changed: false }
  if (existing === incoming || existing.includes(incoming))
    return { content: existing, changed: false }
  if (policy === 'overwrite') return { content: incoming, changed: true }
  if (policy === 'append')
    return { content: `${existing}\n\n${incoming}`, changed: true }
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

const buildBlockBody = (params: {
  content: string
  priority: RememberMemoryPriority
  confidence: number
  source: RememberMemorySource
  policy: RememberMemoryReplacePolicy
}): string =>
  [
    `priority: ${params.priority}`,
    `confidence: ${params.confidence.toFixed(2)}`,
    `source: ${params.source}`,
    `updated_at: ${nowIso()}`,
    `policy: ${params.policy}`,
    '',
    params.content,
    '',
  ].join('\n')

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
    const maxChars = clampMaxChars(input.maxChars)
    const truncated = truncateContent(input.content, maxChars)
    const category = normalizeToken(
      input.category ?? DEFAULT_CATEGORY,
      DEFAULT_CATEGORY,
    )
    const dedupeKey = normalizeToken(
      input.dedupeKey ?? deriveDedupeKey(truncated.content),
      'entry',
    )
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
    const policy = input.replacePolicy ?? 'merge'
    const nextContent = mergeContent(existingContent, truncated.content, policy)
    const operation: RememberMemoryResult['operation'] = !existingBlock
      ? 'created'
      : !nextContent.changed
        ? 'noop'
        : policy === 'overwrite'
          ? 'overwritten'
          : policy === 'append'
            ? 'appended'
            : 'merged'

    if (operation !== 'noop') {
      const block = `${heading}\n${buildBlockBody({
        content: nextContent.content,
        priority: input.priority ?? 'normal',
        confidence: input.confidence ?? 0.8,
        source: input.source ?? 'explicit_user_request',
        policy,
      })}`
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
      merged: operation === 'merged',
      replaced: operation === 'overwritten',
      truncated: truncated.truncated,
      contentChars: truncated.content.length,
    }
  })
