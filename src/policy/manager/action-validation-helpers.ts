import { parseIsoMs } from '../../foundation/shared/time.js'

import {
  formatInvalidActionArgsEmptyHint,
  formatInvalidActionArgsWithIssuesHint,
  formatScheduledAtInvalidHint,
  formatScheduledAtNotFutureHint,
} from './action-feedback-hints-basic.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { ManagerActionFeedbackCode } from '../../foundation/types/index.js'
import type { ZodError, ZodSchema } from 'zod'

export type ValidationIssue = {
  error: string
  hint: string
  code?: ManagerActionFeedbackCode
  disposition?: 'feedback' | 'suppress'
}

const INVALID_ACTION_ARGS = 'invalid_action_args'
const ACTION_EXECUTION_REJECTED = 'action_execution_rejected'
const SCHEDULED_AT_PAST_TOLERANCE_MS = 5_000

const formatIssuePath = (path: readonly PropertyKey[]): string =>
  path.length === 0
    ? '(root)'
    : path
        .map((segment) =>
          typeof segment === 'symbol'
            ? (segment.description ?? 'symbol')
            : String(segment),
        )
        .join('.')

export const invalidArgsIssue = (error: ZodError): ValidationIssue => ({
  error: INVALID_ACTION_ARGS,
  code: 'invalid_action_args',
  hint:
    error.issues.length === 0
      ? formatInvalidActionArgsEmptyHint()
      : formatInvalidActionArgsWithIssuesHint(
          error.issues
            .slice(0, 3)
            .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
            .join('；'),
        ),
})

export const validateItemWithSchema = (
  item: Parsed,
  schema: ZodSchema,
): ValidationIssue[] => {
  const parsed = schema.safeParse(item)
  return parsed.success ? [] : [invalidArgsIssue(parsed.error)]
}

export const rejected = (
  hint: string,
  extras?: {
    code?: ManagerActionFeedbackCode
  },
): ValidationIssue[] => [
  {
    error: ACTION_EXECUTION_REJECTED,
    hint,
    ...(extras?.code ? { code: extras.code } : {}),
  },
]

export const suppressed = (reason = 'suppressed'): ValidationIssue[] => [
  {
    error: 'action_execution_suppressed',
    hint: reason,
    disposition: 'suppress',
  },
]

export const validateScheduledAtNotPast = (params: {
  action: 'set_plan'
  scheduledAt: string
  scheduleNowIso?: string
}): ValidationIssue[] => {
  const { action, scheduledAt, scheduleNowIso } = params
  const trimmed = scheduledAt.trim()

  const scheduledMs = parseIsoMs(trimmed)
  if (scheduledMs === undefined)
    return rejected(formatScheduledAtInvalidHint(action))

  const nowMs = parseIsoMs(scheduleNowIso ?? '') ?? Date.now()
  if (scheduledMs <= nowMs - SCHEDULED_AT_PAST_TOLERANCE_MS) {
    return rejected(
      formatScheduledAtNotFutureHint(action, new Date(nowMs).toISOString()),
    )
  }

  return []
}
