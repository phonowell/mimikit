import { parseIsoMs } from '../shared/time.js'

import type { ZodError } from 'zod'

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
      ? '参数格式不符合要求。'
      : `参数校验失败：${error.issues
          .slice(0, 3)
          .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
          .join('；')}`,
})

export const rejected = (hint: string): ValidationIssue[] => [
  { error: ACTION_EXECUTION_REJECTED, hint },
]

export const validateIsoRangeField = (
  field: 'from' | 'to',
  value: string | undefined,
): ValidationIssue[] => {
  if (!value?.trim()) return []
  if (parseIsoMs(value) !== undefined) return []
  return [
    {
      error: INVALID_ACTION_ARGS,
      hint: `参数校验失败：${field} 必须是合法 ISO 8601 时间。`,
    },
  ]
}

export const validateScheduledAtNotPast = (params: {
  action: 'create_plan' | 'update_plan'
  scheduledAt: string
  scheduleNowIso?: string
}): ValidationIssue[] => {
  const { action, scheduledAt, scheduleNowIso } = params
  const trimmed = scheduledAt.trim()

  if (!Number.isFinite(Date.parse(trimmed))) {
    return rejected(
      `${action} 执行失败：scheduled_at 不是合法 ISO 8601 时间。`,
    )
  }

  const scheduledMs = parseIsoMs(trimmed)
  if (scheduledMs === undefined) {
    return rejected(
      `${action} 执行失败：scheduled_at 不是合法 ISO 8601 时间。`,
    )
  }

  const nowMs = parseIsoMs(scheduleNowIso ?? '') ?? Date.now()
  if (scheduledMs <= nowMs - SCHEDULED_AT_PAST_TOLERANCE_MS) {
    return rejected(
      `${action} 执行失败：scheduled_at 必须晚于当前时间（now=${new Date(nowMs).toISOString()}）。`,
    )
  }

  return []
}
