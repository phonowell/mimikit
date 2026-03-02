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
const integerStringRe = /^[+-]?\d+$/
const decimalStringRe = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/
const focusIdSchema = nonEmptyString.regex(/^focus-[a-zA-Z0-9._-]+$/)
const memorySourceSchema = z.enum(['user', 'agent', 'system'])

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

export const writeMemorySchema = z
  .object({
    content: nonBlankString,
    tags: z.string().trim().optional(),
    source: memorySourceSchema.optional(),
    score: z
      .string()
      .trim()
      .regex(decimalStringRe, 'score must be in range [0, 1]')
      .optional(),
    ttl_days: z
      .string()
      .trim()
      .regex(integerStringRe, 'ttl_days must be an integer string')
      .refine((value) => {
        const parsed = Number(value)
        return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 3650
      }, 'ttl_days must be in range [1, 3650]')
      .optional(),
    expires_at: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.ttl_days && data.expires_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ttl_days and expires_at cannot be used together',
        path: ['ttl_days'],
      })
    }
  })

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
