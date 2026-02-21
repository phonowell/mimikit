import { parseIsoMs } from '../shared/time.js'

import { hasForbiddenWorkerStatePath } from './action-apply-guards.js'
import {
  cancelSchema,
  compressContextSchema,
  createSchema,
  restartSchema,
  summarizeSchema,
} from './action-apply-schema.js'
import { queryHistorySchema } from './history-query-request.js'

import type { Parsed } from '../actions/model/spec.js'
import type { TaskStatus } from '../types/index.js'
import type { ZodError, ZodSchema } from 'zod'

export const REGISTERED_MANAGER_ACTIONS = new Set([
  'create_task',
  'cancel_task',
  'compress_context',
  'summarize_task_result',
  'query_history',
  'restart_server',
])

export type FeedbackContext = {
  taskStatusById?: Map<string, TaskStatus>
  enabledCronJobIds?: Set<string>
  hasPlannerSession?: boolean
  scheduleNowIso?: string
}

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

const invalidArgsIssue = (error: ZodError): ValidationIssue => ({
  error: INVALID_ACTION_ARGS,
  hint:
    error.issues.length === 0
      ? '参数格式不符合要求。'
      : `参数校验失败：${error.issues
          .slice(0, 3)
          .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
          .join('；')}`,
})

const validateWithSchema = (
  item: Parsed,
  schema: ZodSchema,
): ValidationIssue[] => {
  const parsed = schema.safeParse(item.attrs)
  return parsed.success ? [] : [invalidArgsIssue(parsed.error)]
}

const validateCreateTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = createSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const { data } = parsed
  const cron = data.cron?.trim()
  const scheduledAt = data.scheduled_at?.trim()
  const isDeferred = Boolean(cron ?? scheduledAt)
  if (!isDeferred && hasForbiddenWorkerStatePath(data.prompt)) {
    return [
      {
        error: ACTION_EXECUTION_REJECTED,
        hint: 'create_task 被策略拒绝：禁止访问 .mimikit 受保护路径（仅允许 .mimikit/generated）。',
      },
    ]
  }
  if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) {
    return [
      {
        error: ACTION_EXECUTION_REJECTED,
        hint: 'create_task 执行失败：scheduled_at 不是合法 ISO 8601 时间。',
      },
    ]
  }
  if (scheduledAt) {
    const scheduledMs = parseIsoMs(scheduledAt)
    if (scheduledMs !== undefined) {
      const nowMs = parseIsoMs(context.scheduleNowIso ?? '') ?? Date.now()
      if (scheduledMs <= nowMs - SCHEDULED_AT_PAST_TOLERANCE_MS) {
        return [
          {
            error: ACTION_EXECUTION_REJECTED,
            hint: `create_task 执行失败：scheduled_at 必须晚于当前时间（now=${new Date(nowMs).toISOString()}）。`,
          },
        ]
      }
    }
  }
  return []
}

const validateCancelTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = cancelSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]

  const { id } = parsed.data
  if (context.enabledCronJobIds?.has(id)) return []

  const taskStatus = context.taskStatusById?.get(id)
  if (!taskStatus) {
    return [
      {
        error: ACTION_EXECUTION_REJECTED,
        hint: 'cancel_task 执行失败：未找到可取消的任务或定时任务 ID。',
      },
    ]
  }

  if (taskStatus === 'pending' || taskStatus === 'running') return []
  if (taskStatus === 'canceled') {
    return [
      {
        error: ACTION_EXECUTION_REJECTED,
        hint: 'cancel_task 执行失败：任务已是 canceled 状态。',
      },
    ]
  }

  return [
    {
      error: ACTION_EXECUTION_REJECTED,
      hint: 'cancel_task 执行失败：任务已完成，无法取消。',
    },
  ]
}

const validateQueryHistory = (item: Parsed): ValidationIssue[] => {
  const parsed = queryHistorySchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  for (const [field, value] of [
    ['from', parsed.data.from],
    ['to', parsed.data.to],
  ] as const) {
    if (value?.trim() && parseIsoMs(value) === undefined) {
      return [
        {
          error: INVALID_ACTION_ARGS,
          hint: `参数校验失败：${field} 必须是合法 ISO 8601 时间。`,
        },
      ]
    }
  }
  return []
}

const validateCompressContext = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const issues = validateWithSchema(item, compressContextSchema)
  if (issues.length > 0) return issues
  if (context.hasPlannerSession) return []
  return [
    {
      error: ACTION_EXECUTION_REJECTED,
      hint: 'compress_context 执行失败：当前无可压缩的 manager 会话。',
    },
  ]
}

export const validateRegisteredManagerAction = (
  item: Parsed,
  context: FeedbackContext = {},
): ValidationIssue[] => {
  if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) return []
  if (item.name === 'create_task') return validateCreateTask(item, context)
  if (item.name === 'cancel_task') return validateCancelTask(item, context)
  if (item.name === 'compress_context')
    return validateCompressContext(item, context)
  if (item.name === 'query_history') return validateQueryHistory(item)
  if (item.name === 'summarize_task_result')
    return validateWithSchema(item, summarizeSchema)
  if (item.name === 'restart_server')
    return validateWithSchema(item, restartSchema)
  return []
}
