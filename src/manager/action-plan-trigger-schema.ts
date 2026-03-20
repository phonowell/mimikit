import { z } from 'zod'

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

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const planScheduleTypeSchema = z.enum([
  'cron',
  'scheduled_at',
  'on_worker_slot_freed',
])

export const validatePlanTriggerFields = (
  data: {
    schedule_type?: 'cron' | 'scheduled_at' | 'on_worker_slot_freed' | undefined
    cron_expr?: string | undefined
    scheduled_at?: string | undefined
    time_zone?: string | undefined
  },
  ctx: z.RefinementCtx,
): void => {
  const mode = data.schedule_type
  const cronExpr = data.cron_expr?.trim()
  const scheduledAt = data.scheduled_at?.trim()
  const timeZone = data.time_zone?.trim()

  if (mode === 'cron') {
    if (!cronExpr) {
      addCustomIssue(
        ctx,
        'cron_expr',
        'cron_expr is required when schedule_type="cron"',
      )
    }
    if (!timeZone) {
      addCustomIssue(
        ctx,
        'time_zone',
        'time_zone is required when schedule_type="cron"',
      )
    } else if (!isValidTimeZone(timeZone)) {
      addCustomIssue(
        ctx,
        'time_zone',
        'time_zone must be a valid IANA timezone',
      )
    }

    if (scheduledAt) {
      addCustomIssue(
        ctx,
        'scheduled_at',
        'scheduled_at cannot be used when schedule_type="cron"',
      )
    }
    return
  }

  if (mode === 'scheduled_at') {
    if (!scheduledAt) {
      addCustomIssue(
        ctx,
        'scheduled_at',
        'scheduled_at is required when schedule_type="scheduled_at"',
      )
    }
    if (cronExpr) {
      addCustomIssue(
        ctx,
        'cron_expr',
        'cron_expr cannot be used when schedule_type="scheduled_at"',
      )
    }
    if (timeZone) {
      addCustomIssue(
        ctx,
        'time_zone',
        'time_zone cannot be used when schedule_type="scheduled_at"',
      )
    }
    return
  }

  if (mode !== 'on_worker_slot_freed') return
  if (cronExpr) {
    addCustomIssue(
      ctx,
      'cron_expr',
      'cron_expr cannot be used when schedule_type="on_worker_slot_freed"',
    )
  }
  if (scheduledAt) {
    addCustomIssue(
      ctx,
      'scheduled_at',
      'scheduled_at cannot be used when schedule_type="on_worker_slot_freed"',
    )
  }
  if (timeZone) {
    addCustomIssue(
      ctx,
      'time_zone',
      'time_zone cannot be used when schedule_type="on_worker_slot_freed"',
    )
  }
}
