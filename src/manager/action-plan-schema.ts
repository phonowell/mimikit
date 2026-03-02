import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const focusIdSchema = nonEmptyString.regex(/^focus-[a-zA-Z0-9._-]+$/)

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
    if (!cron) addCustomIssue(ctx, 'cron', 'cron is required when trigger_mode="cron"')
    if (scheduledAt)
      addCustomIssue(
        ctx,
        'scheduled_at',
        'scheduled_at cannot be used when trigger_mode="cron"',
      )
    if (hasCooldown)
      addCustomIssue(
        ctx,
        'cooldown_ms',
        'cooldown_ms cannot be used when trigger_mode="cron"',
      )
    return
  }

  if (mode === 'scheduled_at') {
    if (!scheduledAt)
      addCustomIssue(
        ctx,
        'scheduled_at',
        'scheduled_at is required when trigger_mode="scheduled_at"',
      )
    if (cron)
      addCustomIssue(ctx, 'cron', 'cron cannot be used when trigger_mode="scheduled_at"')
    if (hasCooldown)
      addCustomIssue(
        ctx,
        'cooldown_ms',
        'cooldown_ms cannot be used when trigger_mode="scheduled_at"',
      )
    return
  }

  if (mode === 'on_idle') {
    if (cron) addCustomIssue(ctx, 'cron', 'cron cannot be used when trigger_mode="on_idle"')
    if (scheduledAt)
      addCustomIssue(
        ctx,
        'scheduled_at',
        'scheduled_at cannot be used when trigger_mode="on_idle"',
      )
  }
}

const UPDATE_EDITABLE_FIELDS = [
  'prompt',
  'title',
  'trigger_mode',
  'cron',
  'scheduled_at',
  'cooldown_ms',
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
      !UPDATE_EDITABLE_FIELDS.some(
        (key) => data[key as keyof typeof data] !== undefined,
      )
    ) {
      addCustomIssue(ctx, 'id', 'at least one editable field is required')
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
