import { z } from 'zod'

import type { Parsed } from '../actions/model/spec.js'

const nonEmptyString = z.string().trim().min(1)
const focusIdSchema = nonEmptyString.regex(/^focus-[a-zA-Z0-9._-]+$/)

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

export const scheduleTaskSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
    focus_id: focusIdSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasCron = Boolean(data.cron?.trim())
    const hasScheduledAt = Boolean(data.scheduled_at?.trim())
    if (!hasCron && !hasScheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cron or scheduled_at is required',
        path: ['cron'],
      })
      return
    }
    if (hasCron && hasScheduledAt)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cron and scheduled_at are mutually exclusive',
        path: ['cron'],
      })
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
const intentTriggerModeSchema = z.enum(['one_shot', 'on_idle'])
const cooldownMsSchema = z.coerce.number().int().nonnegative()

export const createIntentSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    priority: intentPrioritySchema.optional(),
    source: intentSourceSchema.optional(),
    trigger_mode: intentTriggerModeSchema.optional(),
    cooldown_ms: cooldownMsSchema.optional(),
    focus_id: focusIdSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.cooldown_ms === undefined) return
    if (data.trigger_mode === 'one_shot')
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cooldown_ms cannot be used with trigger_mode="one_shot"',
        path: ['cooldown_ms'],
      })
  })

export const updateIntentSchema = z
  .object({
    id: nonEmptyString,
    prompt: nonEmptyString.optional(),
    title: nonEmptyString.optional(),
    priority: intentPrioritySchema.optional(),
    status: intentStatusSchema.optional(),
    trigger_mode: intentTriggerModeSchema.optional(),
    cooldown_ms: cooldownMsSchema.optional(),
    last_task_id: nonEmptyString.optional(),
    focus_id: focusIdSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.cooldown_ms !== undefined && data.trigger_mode === 'one_shot')
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cooldown_ms cannot be used with trigger_mode="one_shot"',
        path: ['cooldown_ms'],
      })
    if (
      data.prompt === undefined &&
      data.title === undefined &&
      data.priority === undefined &&
      data.status === undefined &&
      data.trigger_mode === undefined &&
      data.cooldown_ms === undefined &&
      data.last_task_id === undefined &&
      data.focus_id === undefined
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

export const createFocusSchema = z
  .object({
    id: focusIdSchema,
    title: nonEmptyString.optional(),
    status: z.enum(['active', 'idle', 'done', 'archived']).optional(),
    summary: z.string().trim().optional(),
    open_items: z.string().trim().optional(),
  })
  .strict()

export const updateFocusSchema = z
  .object({
    id: focusIdSchema,
    title: nonEmptyString.optional(),
    status: z.enum(['active', 'idle', 'done', 'archived']).optional(),
    summary: z.string().trim().optional(),
    open_items: z.string().trim().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.title === undefined &&
      data.status === undefined &&
      data.summary === undefined &&
      data.open_items === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'at least one editable field is required',
        path: ['id'],
      })
    }
  })

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
