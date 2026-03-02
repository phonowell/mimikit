import { z } from 'zod'

import {
  createPlanSchema,
  deletePlanSchema,
  updatePlanSchema,
} from './action-plan-schema.js'
import { readFileToolSchema } from './read-file-tool.js'

import type { Parsed } from '../actions/model/spec.js'
import type { UserChoiceOption } from '../types/index.js'

const nonEmptyString = z.string().trim().min(1)
const focusIdSchema = nonEmptyString.regex(/^focus-[a-zA-Z0-9._-]+$/)
const choiceIdSchema = nonEmptyString.regex(/^choice-[a-zA-Z0-9._-]+$/)
const optionIdSchema = nonEmptyString.regex(/^option-[a-zA-Z0-9._-]+$/)

export { createPlanSchema, deletePlanSchema, updatePlanSchema }

export const summarizeSchema = z
  .object({
    task_id: nonEmptyString,
    summary: nonEmptyString,
  })
  .strict()

export const runTaskSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    focus_id: focusIdSchema.optional(),
  })
  .strict()

export const cancelSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()

export const readFileSchema = readFileToolSchema

export const compressContextSchema = z.object({}).strict()

export const restartSchema = z.object({}).strict()

export const upsertFocusSchema = z
  .object({
    id: focusIdSchema,
    title: nonEmptyString.optional(),
    status: z.enum(['active', 'idle', 'done', 'archived']).optional(),
    summary: z.string().trim().optional(),
    open_items: z.string().trim().optional(),
  })
  .strict()

export const assignFocusSchema = z
  .object({
    target_id: nonEmptyString,
    focus_id: focusIdSchema,
  })
  .strict()

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
    if (!indexRaw || !field) return { ok: false }
    const index = Number.parseInt(indexRaw, 10)
    if (!Number.isInteger(index) || index < 1) return { ok: false }
    const current = indexed.get(index) ?? {}
    current[field] = value
    indexed.set(index, current)
  }
  if (indexed.size < 2) return { ok: false }

  const ordered = [...indexed.keys()].sort((left, right) => left - right)
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
  if (!optionsParsed.value.some((item) => item.id === parsed.data.default_option_id))
    return undefined
  return {
    id: parsed.data.id,
    question: parsed.data.question,
    options: optionsParsed.value,
    defaultOptionId: parsed.data.default_option_id,
    ...(parsed.data.focus_id ? { focusId: parsed.data.focus_id } : {}),
  }
}

const parseSummary = (
  item: Parsed,
): { taskId: string; summary: string } | undefined => {
  const parsed = summarizeSchema.safeParse(item.attrs)
  if (!parsed.success) return undefined
  return { taskId: parsed.data.task_id, summary: parsed.data.summary }
}

export const collectTaskResultSummaries = (
  items: Parsed[],
): Map<string, string> => {
  const summaries = new Map<string, string>()
  for (const item of items) {
    if (item.name !== 'summarize_task_result') continue
    const summary = parseSummary(item)
    if (!summary) continue
    summaries.set(summary.taskId, summary.summary)
  }
  return summaries
}
