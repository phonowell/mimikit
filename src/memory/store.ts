import { z } from 'zod'

import { parseIsoMs } from '../shared/time.js'
import { newId, nowIso } from '../shared/utils.js'
import { readJsonl, writeJsonl } from '../storage/jsonl.js'
import { runSerialized } from '../storage/serialized-lock.js'

import type { MemorySource } from '../types/index.js'

const MAX_MEMORY_ITEMS = 240
const DEFAULT_TTL_DAYS = 365
const MAX_TTL_DAYS = 3650
const DEFAULT_SCORE = 0.8
const MAX_CONTENT_CHARS = 1_200
const MAX_TAGS = 16

const memorySourceSchema = z.enum(['user', 'agent', 'system'])

const memoryRecordSchema = z
  .object({
    id: z.string().regex(/^memory-[a-zA-Z0-9]+$/),
    content: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)).max(MAX_TAGS),
    source: memorySourceSchema,
    score: z.number().min(0).max(1),
    createdAt: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1).optional(),
  })
  .strict()

export type MemoryRecord = z.infer<typeof memoryRecordSchema>

export type WriteMemoryInput = {
  content: string
  tags?: string[]
  source?: MemorySource
  score?: number
  ttlDays?: number
  expiresAt?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

const normalizeContent = (value: string): string =>
  value.replace(/\r\n/g, '\n').trim().slice(0, MAX_CONTENT_CHARS)

const normalizeTag = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().toLowerCase()

const normalizeTags = (tags: string[] = []): string[] => {
  const unique = new Set<string>()
  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (!tag) continue
    unique.add(tag)
  }
  return Array.from(unique).slice(0, MAX_TAGS)
}

const clampScore = (value: number | undefined): number => {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_SCORE
  if (value < 0) return 0
  if (value > 1) return 1
  return Number(value.toFixed(4))
}

const parseMs = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  return parseIsoMs(value)
}

const chooseExpiresAt = (params: {
  nowMs: number
  ttlDays?: number
  expiresAt?: string
  previous?: string
}): string => {
  const candidateMs = parseMs(params.expiresAt)
  const ttlDays = Math.max(
    1,
    Math.min(MAX_TTL_DAYS, Math.floor(params.ttlDays ?? DEFAULT_TTL_DAYS)),
  )
  const ttlMs = params.nowMs + ttlDays * DAY_MS
  const nextMs = candidateMs ?? ttlMs
  const previousMs = parseMs(params.previous)
  const mergedMs =
    previousMs !== undefined ? Math.max(previousMs, nextMs) : nextMs
  return new Date(mergedMs).toISOString()
}

const sortForRetention = (records: MemoryRecord[]): MemoryRecord[] =>
  [...records].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    const aTs = parseMs(a.updatedAt) ?? 0
    const bTs = parseMs(b.updatedAt) ?? 0
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })

const isExpired = (record: MemoryRecord, nowMs: number): boolean => {
  const expiresMs = parseMs(record.expiresAt)
  return expiresMs !== undefined && expiresMs <= nowMs
}

const normalizeRecord = (value: unknown): MemoryRecord | undefined => {
  const parsed = memoryRecordSchema.safeParse(value)
  if (!parsed.success) return undefined
  const normalized: MemoryRecord = {
    ...parsed.data,
    content: normalizeContent(parsed.data.content),
    tags: normalizeTags(parsed.data.tags),
    score: clampScore(parsed.data.score),
  }
  return normalized.content ? normalized : undefined
}

const normalizeForRead = (records: unknown[], nowMs: number): MemoryRecord[] =>
  sortForRetention(
    records
      .map((item) => normalizeRecord(item))
      .filter((item): item is MemoryRecord => Boolean(item))
      .filter((item) => !isExpired(item, nowMs)),
  ).slice(0, MAX_MEMORY_ITEMS)

const dedupeKey = (content: string): string =>
  normalizeContent(content).replace(/\s+/g, ' ').toLowerCase()

export const readMemoryRecords = async (
  recordsPath: string,
): Promise<MemoryRecord[]> => {
  const rows = await readJsonl<unknown>(recordsPath)
  return normalizeForRead(rows, Date.now())
}

export const upsertMemoryRecord = async (
  recordsPath: string,
  input: WriteMemoryInput,
): Promise<MemoryRecord> =>
  runSerialized(recordsPath, async () => {
    const now = nowIso()
    const nowMs = parseMs(now) ?? Date.now()
    const current = await readMemoryRecords(recordsPath)
    const content = normalizeContent(input.content)
    if (!content) throw new Error('write_memory_empty_content')
    const tags = normalizeTags(input.tags)
    const source: MemorySource = input.source ?? 'user'
    const score = clampScore(input.score)
    const matchIndex = current.findIndex(
      (item) => dedupeKey(item.content) === dedupeKey(content),
    )

    let target: MemoryRecord
    if (matchIndex >= 0) {
      const existing = current[matchIndex] as MemoryRecord
      const merged: MemoryRecord = {
        ...existing,
        content,
        tags: normalizeTags([...existing.tags, ...tags]),
        source,
        score: Math.max(existing.score, score),
        updatedAt: now,
        expiresAt: chooseExpiresAt({
          nowMs,
          ...(input.ttlDays !== undefined ? { ttlDays: input.ttlDays } : {}),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          ...(existing.expiresAt ? { previous: existing.expiresAt } : {}),
        }),
      }
      current.splice(matchIndex, 1, merged)
      target = merged
    } else {
      target = {
        id: `memory-${newId()}`,
        content,
        tags,
        source,
        score,
        createdAt: now,
        updatedAt: now,
        expiresAt: chooseExpiresAt({
          nowMs,
          ...(input.ttlDays !== undefined ? { ttlDays: input.ttlDays } : {}),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        }),
      }
      current.push(target)
    }

    let next = sortForRetention(
      current.filter((item) => !isExpired(item, nowMs)),
    ).slice(0, MAX_MEMORY_ITEMS)
    if (!next.some((item) => item.id === target.id)) {
      next = [target, ...next].slice(0, MAX_MEMORY_ITEMS)
    }
    await writeJsonl(recordsPath, next)
    return target
  })
