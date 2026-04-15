import { resolveIntentEvidenceRejectionHint } from './action-intent-evidence.js'
import {
  rejected,
  validateItemWithSchema,
  type ValidationIssue,
} from './action-validation-helpers.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { ZodSchema } from 'zod'

export const resolveScheduleNowOption = (
  context: Pick<FeedbackContext, 'scheduleNowIso'>,
): { scheduleNowIso?: string } =>
  context.scheduleNowIso !== undefined
    ? { scheduleNowIso: context.scheduleNowIso }
    : {}

export const validateWithSchema = (
  item: Parsed,
  schema: ZodSchema,
): ValidationIssue[] => validateItemWithSchema(item, schema)

export const validateHighRiskActionIntentEvidence = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const hint = resolveIntentEvidenceRejectionHint(item, context)
  return hint ? rejected(hint, { code: 'intent_evidence_missing' }) : []
}
