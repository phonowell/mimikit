import { z } from 'zod'

import { focusIdSchema } from '../../foundation/shared/id-schema.js'

import {
  PLAN_EFFECT_DETAIL_FIELDS,
  PLAN_EFFECT_EDITABLE_FIELDS,
  planEffectFields,
  planEffectUpdateFields,
  validatePlanEffectFields,
} from './action-plan-effect-schema.js'
import {
  planScheduleTypeSchema,
  validatePlanTriggerFields,
} from './action-plan-trigger-schema.js'

const nonEmptyString = z.string().trim().min(1)

const planPrioritySchema = z.enum(['high', 'normal', 'low'])
const planStatusSchema = z.enum(['active', 'blocked', 'done'])
const maxRunsSchema = z.coerce.number().int().positive()

const UPDATE_EDITABLE_FIELDS = [
  'title',
  'schedule_type',
  'cron_expr',
  'scheduled_at',
  'time_zone',
  'max_runs',
  'priority',
  'status',
  'focus_id',
  ...PLAN_EFFECT_EDITABLE_FIELDS,
] as const

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

const basePlanSchema = z
  .object({
    title: nonEmptyString,
    schedule_type: planScheduleTypeSchema,
    cron_expr: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
    time_zone: z.string().trim().optional(),
    max_runs: maxRunsSchema.optional(),
    priority: planPrioritySchema.optional(),
    focus_id: focusIdSchema.optional(),
    ...planEffectFields,
  })
  .strict()

export const createPlanSchema = basePlanSchema.superRefine((data, ctx) => {
  validatePlanTriggerFields(data, ctx)
  validatePlanEffectFields(data, ctx, addCustomIssue)
})

export const updatePlanSchema = z
  .object({
    id: nonEmptyString,
    title: nonEmptyString.optional(),
    schedule_type: planScheduleTypeSchema.optional(),
    cron_expr: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
    time_zone: z.string().trim().optional(),
    max_runs: maxRunsSchema.optional(),
    priority: planPrioritySchema.optional(),
    status: planStatusSchema.optional(),
    focus_id: focusIdSchema.optional(),
    ...planEffectUpdateFields,
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
    if (data.schedule_type !== undefined) validatePlanTriggerFields(data, ctx)

    const hasEffectField = PLAN_EFFECT_DETAIL_FIELDS.some(
      (key) => data[key as keyof typeof data] !== undefined,
    )
    if (hasEffectField && data.effect_kind === undefined) {
      addCustomIssue(
        ctx,
        'effect_kind',
        'effect_kind is required when effect fields are provided',
      )
      return
    }
    if (data.effect_kind !== undefined)
      validatePlanEffectFields(data, ctx, addCustomIssue)
  })

export const deletePlanSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()
