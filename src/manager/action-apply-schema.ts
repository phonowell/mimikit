import { z } from 'zod'

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

const planPrioritySchema = z.enum(['high', 'normal', 'low'])
const planStatusSchema = z.enum(['active', 'blocked', 'done'])
const planSourceSchema = z.enum([
  'user_request',
  'agent_auto',
  'retry_decision',
])
const planTriggerModeSchema = z.enum(['cron', 'scheduled_at', 'on_idle'])
const cooldownMsSchema = z.coerce.number().int().nonnegative()
const maxRunsSchema = z.coerce.number().int().positive()

const validatePlanTriggerFields = (
  data: {
    trigger_mode?: 'cron' | 'scheduled_at' | 'on_idle' | undefined
    cron?: string | undefined
    scheduled_at?: string | undefined
    cooldown_ms?: number | undefined
  },
  ctx: z.RefinementCtx,
): void => {
  const mode = data.trigger_mode
  const cron = data.cron?.trim()
  const scheduledAt = data.scheduled_at?.trim()
  const hasCooldown = data.cooldown_ms !== undefined

  if (mode === 'cron') {
    if (!cron) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cron is required when trigger_mode="cron"',
        path: ['cron'],
      })
    }
    if (scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scheduled_at cannot be used when trigger_mode="cron"',
        path: ['scheduled_at'],
      })
    }
    if (hasCooldown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cooldown_ms cannot be used when trigger_mode="cron"',
        path: ['cooldown_ms'],
      })
    }
    return
  }

  if (mode === 'scheduled_at') {
    if (!scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scheduled_at is required when trigger_mode="scheduled_at"',
        path: ['scheduled_at'],
      })
    }
    if (cron) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cron cannot be used when trigger_mode="scheduled_at"',
        path: ['cron'],
      })
    }
    if (hasCooldown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cooldown_ms cannot be used when trigger_mode="scheduled_at"',
        path: ['cooldown_ms'],
      })
    }
    return
  }

  if (mode === 'on_idle') {
    if (cron) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cron cannot be used when trigger_mode="on_idle"',
        path: ['cron'],
      })
    }
    if (scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scheduled_at cannot be used when trigger_mode="on_idle"',
        path: ['scheduled_at'],
      })
    }
  }
}

export const createPlanSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    trigger_mode: planTriggerModeSchema,
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
    cooldown_ms: cooldownMsSchema.optional(),
    max_runs: maxRunsSchema.optional(),
    priority: planPrioritySchema.optional(),
    source: planSourceSchema.optional(),
    focus_id: focusIdSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    validatePlanTriggerFields(data, ctx)
  })

export const updatePlanSchema = z
  .object({
    id: nonEmptyString,
    prompt: nonEmptyString.optional(),
    title: nonEmptyString.optional(),
    trigger_mode: planTriggerModeSchema.optional(),
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
    cooldown_ms: cooldownMsSchema.optional(),
    max_runs: maxRunsSchema.optional(),
    priority: planPrioritySchema.optional(),
    source: planSourceSchema.optional(),
    status: planStatusSchema.optional(),
    last_task_id: nonEmptyString.optional(),
    focus_id: focusIdSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.prompt === undefined &&
      data.title === undefined &&
      data.trigger_mode === undefined &&
      data.cron === undefined &&
      data.scheduled_at === undefined &&
      data.cooldown_ms === undefined &&
      data.max_runs === undefined &&
      data.priority === undefined &&
      data.source === undefined &&
      data.status === undefined &&
      data.last_task_id === undefined &&
      data.focus_id === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'at least one editable field is required',
        path: ['id'],
      })
      return
    }

    const inferredMode =
      data.trigger_mode ??
      (data.cron !== undefined
        ? 'cron'
        : data.scheduled_at !== undefined
          ? 'scheduled_at'
          : data.cooldown_ms !== undefined
            ? 'on_idle'
            : undefined)

    if (inferredMode !== undefined) {
      validatePlanTriggerFields(
        {
          trigger_mode: inferredMode,
          cron: data.cron,
          scheduled_at: data.scheduled_at,
          cooldown_ms: data.cooldown_ms,
        },
        ctx,
      )
    }
  })

export const deletePlanSchema = z
  .object({
    id: nonEmptyString,
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
