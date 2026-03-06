import { z } from 'zod'

import { focusIdSchema } from '../shared/id-schema.js'

const nonEmptyString = z.string().trim().min(1)

const planPrioritySchema = z.enum(['high', 'normal', 'low'])
const planStatusSchema = z.enum(['active', 'blocked', 'done'])
const planSourceSchema = z.enum([
  'user_request',
  'agent_auto',
  'retry_decision',
])
const planTriggerModeSchema = z.enum([
  'cron',
  'scheduled_at',
  'on_worker_slot_freed',
])
const maxRunsSchema = z.coerce.number().int().positive()

const addCustomIssue = (
  ctx: z.RefinementCtx,
  path: string,
  message: string,
): void => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path: [path],
  })
}

const validatePlanTriggerFields = (
  data: {
    trigger_mode?: 'cron' | 'scheduled_at' | 'on_worker_slot_freed' | undefined
    cron?: string | undefined
    scheduled_at?: string | undefined
  },
  ctx: z.RefinementCtx,
): void => {
  const mode = data.trigger_mode
  const cron = data.cron?.trim()
  const scheduledAt = data.scheduled_at?.trim()

  if (mode === 'cron') {
    if (!cron)
      addCustomIssue(ctx, 'cron', 'cron is required when trigger_mode="cron"')
    if (scheduledAt) {
      addCustomIssue(
        ctx,
        'scheduled_at',
        'scheduled_at cannot be used when trigger_mode="cron"',
      )
    }
    return
  }

  if (mode === 'scheduled_at') {
    if (!scheduledAt) {
      addCustomIssue(
        ctx,
        'scheduled_at',
        'scheduled_at is required when trigger_mode="scheduled_at"',
      )
    }
    if (cron) {
      addCustomIssue(
        ctx,
        'cron',
        'cron cannot be used when trigger_mode="scheduled_at"',
      )
    }
    return
  }

  if (mode === 'on_worker_slot_freed') {
    if (cron) {
      addCustomIssue(
        ctx,
        'cron',
        'cron cannot be used when trigger_mode="on_worker_slot_freed"',
      )
    }
    if (scheduledAt) {
      addCustomIssue(
        ctx,
        'scheduled_at',
        'scheduled_at cannot be used when trigger_mode="on_worker_slot_freed"',
      )
    }
  }
}

const UPDATE_EDITABLE_FIELDS = [
  'prompt',
  'title',
  'trigger_mode',
  'cron',
  'scheduled_at',
  'max_runs',
  'priority',
  'source',
  'status',
  'last_task_id',
  'focus_id',
] as const

export const createPlanSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    trigger_mode: planTriggerModeSchema,
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
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
      !UPDATE_EDITABLE_FIELDS.some(
        (key) => data[key as keyof typeof data] !== undefined,
      )
    ) {
      addCustomIssue(ctx, 'id', 'at least one editable field is required')
      return
    }

    const hasTriggerField =
      data.cron !== undefined || data.scheduled_at !== undefined
    if (hasTriggerField && data.trigger_mode === undefined) {
      addCustomIssue(
        ctx,
        'trigger_mode',
        'trigger_mode is required when cron/scheduled_at is provided',
      )
      return
    }
    if (data.trigger_mode === undefined) return
    validatePlanTriggerFields(
      {
        trigger_mode: data.trigger_mode,
        cron: data.cron,
        scheduled_at: data.scheduled_at,
      },
      ctx,
    )
  })

export const deletePlanSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()
