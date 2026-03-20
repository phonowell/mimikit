import { z } from 'zod'

import { focusIdSchema } from '../shared/id-schema.js'

import {
  planScheduleTypeSchema,
  validatePlanTriggerFields,
} from './action-plan-trigger-schema.js'

const nonEmptyString = z.string().trim().min(1)

const planPrioritySchema = z.enum(['high', 'normal', 'low'])
const planStatusSchema = z.enum(['active', 'blocked', 'done'])
const planSourceSchema = z.enum([
  'user_request',
  'agent_auto',
  'retry_decision',
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

const UPDATE_EDITABLE_FIELDS = [
  'prompt',
  'title',
  'schedule_type',
  'cron_expr',
  'scheduled_at',
  'time_zone',
  'max_runs',
  'priority',
  'source',
  'status',
  'focus_id',
] as const

export const createPlanSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    schedule_type: planScheduleTypeSchema,
    cron_expr: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
    time_zone: z.string().trim().optional(),
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
    schedule_type: planScheduleTypeSchema.optional(),
    cron_expr: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
    time_zone: z.string().trim().optional(),
    max_runs: maxRunsSchema.optional(),
    priority: planPrioritySchema.optional(),
    source: planSourceSchema.optional(),
    status: planStatusSchema.optional(),
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
      data.cron_expr !== undefined ||
      data.scheduled_at !== undefined ||
      data.time_zone !== undefined
    if (hasTriggerField && data.schedule_type === undefined) {
      addCustomIssue(
        ctx,
        'schedule_type',
        'schedule_type is required when cron_expr/scheduled_at/time_zone is provided',
      )
      return
    }
    if (data.schedule_type === undefined) return
    validatePlanTriggerFields(
      {
        schedule_type: data.schedule_type,
        cron_expr: data.cron_expr,
        scheduled_at: data.scheduled_at,
        time_zone: data.time_zone,
      },
      ctx,
    )
  })

export const deletePlanSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()
