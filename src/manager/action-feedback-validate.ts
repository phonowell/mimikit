import { parseIsoMs } from '../shared/time.js'

import { hasForbiddenWorkerStatePath } from './action-apply-guards.js'
import {
  assignFocusSchema,
  cancelSchema,
  compressContextSchema,
  createFocusSchema,
  createIntentSchema,
  deleteIntentSchema,
  restartSchema,
  runTaskSchema,
  scheduleTaskSchema,
  summarizeSchema,
  updateFocusSchema,
  updateIntentSchema,
} from './action-apply-schema.js'
import { queryHistorySchema } from '../history/query.js'

import type { Parsed } from '../actions/model/spec.js'
import type { IdleIntentStatus, TaskStatus } from '../types/index.js'
import type { ZodError, ZodSchema } from 'zod'

export const REGISTERED_MANAGER_ACTIONS = new Set([
  'create_intent',
  'update_intent',
  'delete_intent',
  'run_task',
  'schedule_task',
  'cancel_task',
  'compress_context',
  'summarize_task_result',
  'query_history',
  'restart_runtime',
  'create_focus',
  'update_focus',
  'assign_focus',
])

export type FeedbackContext = {
  taskStatusById?: Map<string, TaskStatus>
  intentStatusById?: Map<string, IdleIntentStatus>
  enabledCronJobIds?: Set<string>
  hasCompressibleContext?: boolean
  scheduleNowIso?: string
}

export type ValidationIssue = {
  error: string
  hint: string
}

const INVALID_ACTION_ARGS = 'invalid_action_args'
const ACTION_EXECUTION_REJECTED = 'action_execution_rejected'
const SCHEDULED_AT_PAST_TOLERANCE_MS = 5_000

const rejected = (hint: string): ValidationIssue[] => [
  { error: ACTION_EXECUTION_REJECTED, hint },
]

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

const validateRunTask = (item: Parsed): ValidationIssue[] => {
  const parsed = runTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  if (hasForbiddenWorkerStatePath(parsed.data.prompt))
    return rejected('run_task 被策略拒绝：禁止访问 .mimikit 受保护路径（仅允许 .mimikit/generated）。')
  return []
}

const validateScheduleTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = scheduleTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const scheduledAt = parsed.data.scheduled_at?.trim()
  if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt)))
    return rejected('schedule_task 执行失败：scheduled_at 不是合法 ISO 8601 时间。')
  if (scheduledAt) {
    const scheduledMs = parseIsoMs(scheduledAt)
    if (scheduledMs !== undefined) {
      const nowMs = parseIsoMs(context.scheduleNowIso ?? '') ?? Date.now()
      if (scheduledMs <= nowMs - SCHEDULED_AT_PAST_TOLERANCE_MS)
        return rejected(`schedule_task 执行失败：scheduled_at 必须晚于当前时间（now=${new Date(nowMs).toISOString()}）。`)
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
  if (!taskStatus) return rejected('cancel_task 执行失败：未找到可取消的任务或定时任务 ID。')
  if (taskStatus === 'pending' || taskStatus === 'running') return []
  if (taskStatus === 'canceled') return rejected('cancel_task 执行失败：任务已是 canceled 状态。')
  return rejected('cancel_task 执行失败：任务已完成，无法取消。')
}

const validateQueryHistory = (item: Parsed): ValidationIssue[] => {
  const parsed = queryHistorySchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  for (const [field, value] of [
    ['from', parsed.data.from],
    ['to', parsed.data.to],
  ] as const) {
    if (value?.trim() && parseIsoMs(value) === undefined)
      return [{ error: INVALID_ACTION_ARGS, hint: `参数校验失败：${field} 必须是合法 ISO 8601 时间。` }]
  }
  return []
}

const validateCompressContext = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const issues = validateWithSchema(item, compressContextSchema)
  if (issues.length > 0) return issues
  if (context.hasCompressibleContext) return []
  return rejected('compress_context 执行失败：当前无可压缩上下文。')
}

const validateIntentById = (
  action: string,
  item: Parsed,
  schema: ZodSchema<{ id: string }>,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = schema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const intentStatus = context.intentStatusById?.get(parsed.data.id)
  if (!intentStatus) return rejected(`${action} 执行失败：未找到 intent ID。`)
  if (intentStatus === 'done') return rejected(`${action} 执行失败：done intent 不可${action === 'update_intent' ? '修改' : '删除'}。`)
  return []
}

export const validateRegisteredManagerAction = (
  item: Parsed,
  context: FeedbackContext = {},
): ValidationIssue[] => {
  if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) return []
  if (item.name === 'create_intent')
    return validateWithSchema(item, createIntentSchema)
  if (item.name === 'update_intent')
    return validateIntentById('update_intent', item, updateIntentSchema, context)
  if (item.name === 'delete_intent')
    return validateIntentById('delete_intent', item, deleteIntentSchema, context)
  if (item.name === 'run_task') return validateRunTask(item)
  if (item.name === 'schedule_task') return validateScheduleTask(item, context)
  if (item.name === 'cancel_task') return validateCancelTask(item, context)
  if (item.name === 'compress_context')
    return validateCompressContext(item, context)
  if (item.name === 'query_history') return validateQueryHistory(item)
  if (item.name === 'summarize_task_result')
    return validateWithSchema(item, summarizeSchema)
  if (item.name === 'restart_runtime')
    return validateWithSchema(item, restartSchema)
  if (item.name === 'create_focus') return validateWithSchema(item, createFocusSchema)
  if (item.name === 'update_focus') return validateWithSchema(item, updateFocusSchema)
  if (item.name === 'assign_focus') return validateWithSchema(item, assignFocusSchema)
  return []
}
