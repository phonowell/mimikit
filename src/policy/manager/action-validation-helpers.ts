import { parseIsoMs } from '../../foundation/shared/time.js'

import {
  formatInvalidActionArgsEmptyHint,
  formatInvalidActionArgsWithIssuesHint,
  formatScheduledAtInvalidHint,
  formatScheduledAtNotFutureHint,
} from './action-feedback-hints.js'

import type {
  ManagerActionFeedbackCode,
  ManagerActionFeedbackRepair,
} from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'
import type { ZodError, ZodSchema } from 'zod'

export type ValidationIssue = {
  error: string
  hint: string
  code?: ManagerActionFeedbackCode
  repair?: ManagerActionFeedbackRepair
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

const isMissingRequiredStringIssue = (
  issue: ZodError['issues'][number],
): boolean => {
  if (issue.code !== 'invalid_type' || issue.path.length === 0) return false
  const issueData = issue as { expected?: unknown; input?: unknown }
  return issueData.expected === 'string' && issueData.input === undefined
}

const buildInvalidActionArgsRepair = (
  error: ZodError,
): ManagerActionFeedbackRepair => {
  const issues = error.issues
    .slice(0, 3)
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
  const missingRequiredAttrs = error.issues
    .filter((issue) => isMissingRequiredStringIssue(issue))
    .map((issue) => formatIssuePath(issue.path))
  const unknownAttrs = error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => key.trim()).filter((key) => key.length > 0)
      : [],
  )

  return {
    kind: 'fix_action_args',
    ...(issues.length > 0 ? { issues } : {}),
    ...(missingRequiredAttrs[0]
      ? {
          missing_required_attr: missingRequiredAttrs[0],
          missing_required_attrs: missingRequiredAttrs,
        }
      : {}),
    ...(unknownAttrs.length > 0 ? { unknown_attrs: unknownAttrs } : {}),
  }
}

export const invalidArgsIssue = (error: ZodError): ValidationIssue => ({
  error: INVALID_ACTION_ARGS,
  code: 'invalid_action_args',
  repair: buildInvalidActionArgsRepair(error),
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

export const rejected = (
  hint: string,
  extras?: {
    code?: ManagerActionFeedbackCode
    repair?: ManagerActionFeedbackRepair
  },
): ValidationIssue[] => [
  {
    error: ACTION_EXECUTION_REJECTED,
    hint,
    ...(extras?.code ? { code: extras.code } : {}),
    ...(extras?.repair ? { repair: extras.repair } : {}),
  },
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
