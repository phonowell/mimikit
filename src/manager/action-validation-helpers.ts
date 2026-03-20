import { parseIsoMs } from '../shared/time.js'

import {
  formatInvalidActionArgsEmptyHint,
  formatInvalidActionArgsWithIssuesHint,
  formatScheduledAtInvalidHint,
  formatScheduledAtNotFutureHint,
} from './action-feedback-hints.js'

import type { Parsed } from '../actions/model/spec.js'
import type { ZodError, ZodSchema } from 'zod'

export type ValidationIssue = {
  error: string
  hint: string
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
  const parsed = schema.safeParse(item.attrs)
  return parsed.success ? [] : [invalidArgsIssue(parsed.error)]
}

export const rejected = (hint: string): ValidationIssue[] => [
  { error: ACTION_EXECUTION_REJECTED, hint },
]

export const validateScheduledAtNotPast = (params: {
  action: 'create_plan' | 'update_plan'
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
