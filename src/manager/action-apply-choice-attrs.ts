import { z } from 'zod'

import {
  choiceIdSchema,
  focusIdSchema,
  optionIdSchema,
} from '../shared/id-schema.js'

import type { UserChoiceOption } from '../types/index.js'

const nonEmptyString = z.string().trim().min(1)

const hasContiguousIndices = (indices: number[]): boolean => {
  if (indices.length === 0) return true
  const ordered = [...new Set(indices)].sort((left, right) => left - right)
  return ordered.every((index, offset) => index === offset + 1)
}

const choiceOptionSchema = z
  .object({
    id: optionIdSchema,
    label: nonEmptyString,
    reason: nonEmptyString,
  })
  .strict()

const choiceOptionsSchema = z
  .array(choiceOptionSchema)
  .min(2)
  .superRefine((items, context) => {
    const seen = new Set<string>()
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        continue
      }
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate option id: ${item.id}`,
      })
    }
  })

const optionAttrRe = /^option_(\d+)_(id|label|reason)$/
const askUserChoiceBaseKeys = new Set([
  'id',
  'question',
  'default_option_id',
  'focus_id',
])

export const askUserChoiceSchema = z
  .object({
    id: choiceIdSchema,
    question: nonEmptyString,
    default_option_id: optionIdSchema,
    focus_id: focusIdSchema.optional(),
  })
  .passthrough()

const parseChoiceOptions = (
  attrs: Record<string, unknown>,
): { ok: true; value: UserChoiceOption[] } | { ok: false } => {
  const indexed = new Map<
    number,
    Partial<Record<'id' | 'label' | 'reason', string>>
  >()
  for (const [key, value] of Object.entries(attrs)) {
    if (askUserChoiceBaseKeys.has(key)) continue
    if (typeof value !== 'string') return { ok: false }
    const match = optionAttrRe.exec(key)
    if (!match) return { ok: false }
    const indexRaw = match[1]
    const field = match[2] as 'id' | 'label' | 'reason'
    if (!indexRaw) return { ok: false }
    const index = Number.parseInt(indexRaw, 10)
    if (!Number.isInteger(index) || index < 1) return { ok: false }
    const current = indexed.get(index) ?? {}
    current[field] = value
    indexed.set(index, current)
  }
  if (indexed.size < 2) return { ok: false }

  const ordered = [...indexed.keys()].sort((left, right) => left - right)
  if (!hasContiguousIndices(ordered)) return { ok: false }
  const options: UserChoiceOption[] = []
  for (const index of ordered) {
    const item = indexed.get(index)
    if (!item?.id || !item.label || !item.reason) return { ok: false }
    options.push({
      id: item.id,
      label: item.label,
      reason: item.reason,
    })
  }

  const validated = choiceOptionsSchema.safeParse(options)
  if (!validated.success) return { ok: false }
  return { ok: true, value: validated.data }
}

export const parseAskUserChoiceAttrs = (
  attrs: Record<string, string>,
):
  | {
      id: string
      question: string
      options: UserChoiceOption[]
      defaultOptionId: string
      focusId?: string
    }
  | undefined => {
  const parsed = askUserChoiceSchema.safeParse(attrs)
  if (!parsed.success) return undefined
  const optionsParsed = parseChoiceOptions(parsed.data)
  if (!optionsParsed.ok) return undefined
  if (
    !optionsParsed.value.some(
      (item) => item.id === parsed.data.default_option_id,
    )
  )
    return undefined
  return {
    id: parsed.data.id,
    question: parsed.data.question,
    options: optionsParsed.value,
    defaultOptionId: parsed.data.default_option_id,
    ...(parsed.data.focus_id ? { focusId: parsed.data.focus_id } : {}),
  }
}
