import { z } from 'zod'

import {
  MAX_FOCUS_OPEN_ITEM_CHARS,
  MAX_FOCUS_SUMMARY_CHARS,
  validateFocusDigestText,
} from '../focus/digest.js'
import { normalizeFocusOpenItems } from '../focus/open-items.js'
import { focusIdSchema } from '../shared/id-schema.js'

const nonEmptyString = z.string().trim().min(1)

const hasContiguousIndices = (indices: number[]): boolean => {
  if (indices.length === 0) return true
  const ordered = [...new Set(indices)].sort((left, right) => left - right)
  return ordered.every((index, offset) => index === offset + 1)
}

const openItemAttrRe = /^open_item_(\d+)$/
const upsertFocusBaseKeys = new Set(['id', 'title', 'status', 'summary'])

export const upsertFocusSchema = z
  .object({
    id: focusIdSchema,
    title: nonEmptyString.optional(),
    status: z.enum(['active', 'idle', 'done', 'archived']).optional(),
    summary: z.string().trim().optional(),
  })
  .passthrough()
  .superRefine((data, context) => {
    if (typeof data.summary === 'string') {
      const issue = validateFocusDigestText({
        key: 'summary',
        value: data.summary,
        maxChars: MAX_FOCUS_SUMMARY_CHARS,
      })
      if (issue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue,
          path: ['summary'],
        })
      }
    }
    const openItemIndices: number[] = []
    for (const [key, value] of Object.entries(data)) {
      if (upsertFocusBaseKeys.has(key)) continue
      if (typeof value !== 'string') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} must be a string`,
          path: [key],
        })
        continue
      }
      const match = openItemAttrRe.exec(key)
      if (!match) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} is not allowed`,
          path: [key],
        })
        continue
      }
      const indexRaw = match[1]
      if (!indexRaw) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} index is required`,
          path: [key],
        })
        continue
      }
      const index = Number.parseInt(indexRaw, 10)
      if (!Number.isInteger(index) || index < 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} index must be >= 1`,
          path: [key],
        })
        continue
      }
      openItemIndices.push(index)
      if (!value.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} must be non-empty`,
          path: [key],
        })
        continue
      }
      const digestIssue = validateFocusDigestText({
        key,
        value,
        maxChars: MAX_FOCUS_OPEN_ITEM_CHARS,
      })
      if (digestIssue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: digestIssue,
          path: [key],
        })
      }
    }
    if (!hasContiguousIndices(openItemIndices)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'open_item_{n} indices must start at 1 and increase contiguously',
        path: ['open_item_1'],
      })
    }
  })

const parseUpsertFocusOpenItems = (
  attrs: Record<string, unknown>,
): { ok: true; value: string[] | undefined } | { ok: false } => {
  const indexed = new Map<number, string>()
  for (const [key, value] of Object.entries(attrs)) {
    if (upsertFocusBaseKeys.has(key)) continue
    if (typeof value !== 'string') return { ok: false }
    const match = openItemAttrRe.exec(key)
    if (!match) return { ok: false }
    const indexRaw = match[1]
    if (!indexRaw) return { ok: false }
    const index = Number.parseInt(indexRaw, 10)
    if (!Number.isInteger(index) || index < 1) return { ok: false }
    const normalized = value.trim()
    if (!normalized) return { ok: false }
    indexed.set(index, normalized)
  }
  if (indexed.size === 0) return { ok: true, value: undefined }

  const ordered = [...indexed.keys()].sort((left, right) => left - right)
  if (!hasContiguousIndices(ordered)) return { ok: false }
  const values = ordered
    .map((index) => indexed.get(index))
    .filter((item): item is string => Boolean(item))
  return {
    ok: true,
    value: normalizeFocusOpenItems(values, { coerceNonString: false }),
  }
}

export const parseUpsertFocusAttrs = (
  attrs: Record<string, string>,
):
  | {
      id: string
      title?: string
      status?: 'active' | 'idle' | 'done' | 'archived'
      summary?: string
      openItems?: string[]
    }
  | undefined => {
  const parsed = upsertFocusSchema.safeParse(attrs)
  if (!parsed.success) return undefined
  const openItems = parseUpsertFocusOpenItems(parsed.data)
  if (!openItems.ok) return undefined
  return {
    id: parsed.data.id,
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.summary !== undefined
      ? { summary: parsed.data.summary }
      : {}),
    ...(openItems.value ? { openItems: openItems.value } : {}),
  }
}
