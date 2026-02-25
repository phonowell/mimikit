import { z } from 'zod'

import type { Parsed } from '../actions/model/spec.js'

const nonEmptyString = z.string().trim().min(1)

export const summarizeSchema = z
  .object({
    task_id: nonEmptyString,
    summary: nonEmptyString,
  })
  .strict()

export const createSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasCron = Boolean(data.cron?.trim())
    const hasScheduledAt = Boolean(data.scheduled_at?.trim())
    if (hasCron && hasScheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cron and scheduled_at are mutually exclusive',
        path: ['cron'],
      })
    }
  })

export const cancelSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()

export const compressContextSchema = z.object({}).strict()

export const restartSchema = z.object({}).strict()

const intentPrioritySchema = z.enum(['high', 'normal', 'low'])
const intentStatusSchema = z.enum(['pending', 'blocked', 'done'])
const intentSourceSchema = z.enum([
  'user_request',
  'agent_auto',
  'retry_decision',
])

export const createIntentSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    priority: intentPrioritySchema.optional(),
    source: intentSourceSchema.optional(),
  })
  .strict()

export const updateIntentSchema = z
  .object({
    id: nonEmptyString,
    prompt: nonEmptyString.optional(),
    title: nonEmptyString.optional(),
    priority: intentPrioritySchema.optional(),
    status: intentStatusSchema.optional(),
    last_task_id: nonEmptyString.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.prompt === undefined &&
      data.title === undefined &&
      data.priority === undefined &&
      data.status === undefined &&
      data.last_task_id === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'at least one editable field is required',
        path: ['id'],
      })
    }
  })

export const deleteIntentSchema = z
  .object({
    id: nonEmptyString,
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
