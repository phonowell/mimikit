import { z } from 'zod'

import {
  createPlanSchema,
  deletePlanSchema,
  updatePlanSchema,
} from './action-plan-schema.js'
import { readFileToolSchema } from './read-file-tool.js'

import type { Parsed } from '../actions/model/spec.js'

const nonEmptyString = z.string().trim().min(1)
const nonBlankString = z
  .string()
  .refine(
    (value) => value.trim().length > 0,
    'must contain at least one non-whitespace character',
  )
const focusIdSchema = nonEmptyString.regex(/^focus-[a-zA-Z0-9._-]+$/)

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

export const writeProfileSchema = z
  .object({
    target: z.enum(['persona', 'user']),
    content: nonBlankString,
  })
  .strict()

export const appendMemorySchema = z
  .object({
    content: nonBlankString,
    entry_title: z.string().trim().optional(),
  })
  .strict()

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
