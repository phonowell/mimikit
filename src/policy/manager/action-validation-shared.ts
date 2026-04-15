import {
  validateItemWithSchema,
  type ValidationIssue,
} from './action-validation-helpers.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { ZodSchema } from 'zod'

export const resolveScheduleNowOption = (context: {
  scheduleNowIso?: string
}): { scheduleNowIso?: string } =>
  context.scheduleNowIso !== undefined
    ? { scheduleNowIso: context.scheduleNowIso }
    : {}

export const validateWithSchema = (
  item: Parsed,
  schema: ZodSchema,
): ValidationIssue[] => validateItemWithSchema(item, schema)
