import { createPlanSchema, updatePlanSchema } from './action-apply-schema.js'
import { parseActionAttrs } from './action-parse.js'
import {
  validateScheduledAtNotPast,
  type ValidationIssue,
} from './action-validation-helpers.js'

import type { Parsed } from '../actions/model/spec.js'
import type { ManagerWakeProfile } from '../types/index.js'

type ScheduleFeedbackContext = {
  scheduleNowIso?: string
  wakeProfile?: ManagerWakeProfile
}

const resolveScheduleNowOption = (
  context: ScheduleFeedbackContext,
): { scheduleNowIso?: string } =>
  context.scheduleNowIso !== undefined
    ? { scheduleNowIso: context.scheduleNowIso }
    : {}

export const validateCreatePlanSchedule = (
  item: Parsed,
  context: ScheduleFeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, createPlanSchema)
  if (!parsed) return []
  if (parsed.schedule_type !== 'scheduled_at' || !parsed.scheduled_at?.trim())
    return []
  return validateScheduledAtNotPast({
    action: 'create_plan',
    scheduledAt: parsed.scheduled_at,
    ...resolveScheduleNowOption(context),
  })
}

export const validateUpdatePlanSchedule = (
  item: Parsed,
  context: ScheduleFeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, updatePlanSchema)
  if (!parsed) return []
  const scheduledAt = parsed.scheduled_at?.trim()
  if (parsed.schedule_type !== 'scheduled_at' || !scheduledAt) return []
  return validateScheduledAtNotPast({
    action: 'update_plan',
    scheduledAt,
    ...resolveScheduleNowOption(context),
  })
}
