import { parseIsoMs } from '../shared/time.js'

import { hasForbiddenWorkerStatePath } from './action-apply-guards.js'
import {
  cancelSchema,
  createSchema,
  restartSchema,
  summarizeSchema,
} from './action-apply-schema.js'
import { queryHistorySchema } from './history-query-request.js'

import type { Parsed } from '../actions/model/spec.js'
import type { TaskStatus } from '../types/index.js'
import type { ZodError } from 'zod'

export const REGISTERED_MANAGER_ACTIONS = new Set([
  'create_task',
  'cancel_task',
  'summarize_task_result',
  'query_history',
  'restart_server',
])

export type FeedbackContext = {
  taskStatusById?: Map<string, TaskStatus>
  enabledCronJobIds?: Set<string>
}

export type ValidationIssue = {
  error: string
  hint: string
}

const INVALID_ACTION_ARGS = 'invalid_action_args'
const ACTION_EXECUTION_REJECTED = 'action_execution_rejected'

const formatIssuePath = (path: readonly PropertyKey[]): string => {
  if (path.length === 0) return '(root)'
  return path
    .map((segment) =>
      typeof segment === 'symbol'
        ? (segment.description ?? 'symbol')
        : String(segment),
    )
    .join('.')
}

const formatZodError = (error: ZodError): string => {
  const issues = error.issues
    .slice(0, 3)
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
  if (issues.length === 0) return '参数格式不符合要求。'
  return `参数校验失败：${issues.join('；')}`
}

const invalidArgsIssue = (error: ZodError): ValidationIssue => ({
  error: INVALID_ACTION_ARGS,
  hint: formatZodError(error),
})

const validateCreateTask = (item: Parsed): ValidationIssue[] => {
  const parsed = createSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const { data } = parsed
  if (data.profile !== 'deferred' && hasForbiddenWorkerStatePath(data.prompt)) {
    return [
      {
        error: ACTION_EXECUTION_REJECTED,
        hint: 'create_task 被策略拒绝：禁止访问 .mimikit 受保护路径（仅允许 .mimikit/generated）。',
      },
    ]
  }
  const scheduledAt = data.scheduled_at?.trim()
  if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) {
    return [
      {
        error: ACTION_EXECUTION_REJECTED,
        hint: 'create_task 执行失败：scheduled_at 不是合法 ISO 8601 时间。',
      },
    ]
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
  const cronExists = context.enabledCronJobIds?.has(id) ?? false
  if (cronExists) return []

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

const validateSummarizeTaskResult = (item: Parsed): ValidationIssue[] => {
  const parsed = summarizeSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  return []
}

const validateQueryHistory = (item: Parsed): ValidationIssue[] => {
  const parsed = queryHistorySchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]

  const from = parsed.data.from?.trim()
  if (from && parseIsoMs(from) === undefined) {
    return [
      {
        error: INVALID_ACTION_ARGS,
        hint: '参数校验失败：from 必须是合法 ISO 8601 时间。',
      },
    ]
  }
  const to = parsed.data.to?.trim()
  if (to && parseIsoMs(to) === undefined) {
    return [
      {
        error: INVALID_ACTION_ARGS,
        hint: '参数校验失败：to 必须是合法 ISO 8601 时间。',
      },
    ]
  }
  return []
}

const validateRestartServer = (item: Parsed): ValidationIssue[] => {
  const parsed = restartSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  return []
}

export const validateRegisteredManagerAction = (
  item: Parsed,
  context: FeedbackContext = {},
): ValidationIssue[] => {
  if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) return []
  if (item.name === 'create_task') return validateCreateTask(item)
  if (item.name === 'cancel_task') return validateCancelTask(item, context)
  if (item.name === 'summarize_task_result')
    return validateSummarizeTaskResult(item)
  if (item.name === 'query_history') return validateQueryHistory(item)
  if (item.name === 'restart_server') return validateRestartServer(item)
  return []
}
