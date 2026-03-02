import { queryHistorySchema } from '../history/query.js'
import { parseIsoMs } from '../shared/time.js'

import {
  cancelSchema,
  compressContextSchema,
  createPlanSchema,
  readFileSchema,
  runTaskSchema,
  updatePlanSchema,
  writePersonaSchema,
  writeUserProfileSchema,
} from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { TaskStatus, TaskPlanStatus } from '../types/index.js'
import type { ZodError, ZodSchema } from 'zod'

export type FeedbackContext = {
  taskStatusById?: Map<string, TaskStatus>
  planStatusById?: Map<string, TaskPlanStatus>
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

export const validateWithSchema = (
  item: Parsed,
  schema: ZodSchema,
): ValidationIssue[] => {
  const parsed = schema.safeParse(item.attrs)
  return parsed.success ? [] : [invalidArgsIssue(parsed.error)]
}

export const validateRunTask = (item: Parsed): ValidationIssue[] => {
  const parsed = runTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  return []
}

export const validateCreatePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = createPlanSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  if (
    parsed.data.trigger_mode === 'scheduled_at' &&
    parsed.data.scheduled_at?.trim()
  ) {
    const scheduledAt = parsed.data.scheduled_at.trim()
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      return rejected(
        'create_plan 执行失败：scheduled_at 不是合法 ISO 8601 时间。',
      )
    }
    const scheduledMs = parseIsoMs(scheduledAt)
    if (scheduledMs !== undefined) {
      const nowMs = parseIsoMs(context.scheduleNowIso ?? '') ?? Date.now()
      if (scheduledMs <= nowMs - SCHEDULED_AT_PAST_TOLERANCE_MS) {
        return rejected(
          `create_plan 执行失败：scheduled_at 必须晚于当前时间（now=${new Date(nowMs).toISOString()}）。`,
        )
      }
    }
  }
  return []
}

export const validateCancelTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = cancelSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const { id } = parsed.data
  const taskStatus = context.taskStatusById?.get(id)
  if (!taskStatus)
    return rejected('cancel_task 执行失败：未找到可取消的任务 ID。')

  if (taskStatus === 'pending' || taskStatus === 'running') return []
  if (taskStatus === 'canceled')
    return rejected('cancel_task 执行失败：任务已是 canceled 状态。')

  return rejected('cancel_task 执行失败：任务已完成，无法取消。')
}

export const validateQueryHistory = (item: Parsed): ValidationIssue[] => {
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

export const validateReadFile = (item: Parsed): ValidationIssue[] => {
  const parsed = readFileSchema.safeParse(item.attrs)
  return parsed.success ? [] : [invalidArgsIssue(parsed.error)]
}

export const validateWritePersona = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, writePersonaSchema)

export const validateWriteUserProfile = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, writeUserProfileSchema)

export const validateCompressContext = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const issues = validateWithSchema(item, compressContextSchema)
  if (issues.length > 0) return issues
  if (context.hasCompressibleContext) return []
  return rejected('compress_context 执行失败：当前无可压缩上下文。')
}

export const validatePlanById = (
  action: 'update_plan' | 'delete_plan',
  item: Parsed,
  schema: ZodSchema<{ id: string }>,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = schema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const status = context.planStatusById?.get(parsed.data.id)
  if (!status) return rejected(`${action} 执行失败：未找到 plan ID。`)
  if (action === 'update_plan' && status === 'done') {
    const keys = new Set(Object.keys(item.attrs))
    const isLastTaskPatch =
      keys.size > 0 &&
      [...keys].every((key) => key === 'id' || key === 'last_task_id') &&
      typeof item.attrs.last_task_id === 'string' &&
      item.attrs.last_task_id.trim().length > 0
    if (isLastTaskPatch) return []
    return rejected('update_plan 执行失败：done plan 不可修改。')
  }
  if (action === 'delete_plan' && status === 'done') return []
  if (action === 'delete_plan') return []
  return []
}

export const validateUpdatePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = updatePlanSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const scheduledAt = parsed.data.scheduled_at?.trim()
  const resolvedMode =
    parsed.data.trigger_mode ??
    (parsed.data.cron !== undefined
      ? 'cron'
      : parsed.data.scheduled_at !== undefined
        ? 'scheduled_at'
        : parsed.data.cooldown_ms !== undefined
          ? 'on_idle'
          : undefined)

  if (resolvedMode === 'scheduled_at' && scheduledAt) {
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      return rejected(
        'update_plan 执行失败：scheduled_at 不是合法 ISO 8601 时间。',
      )
    }
    const scheduledMs = parseIsoMs(scheduledAt)
    if (scheduledMs !== undefined) {
      const nowMs = parseIsoMs(context.scheduleNowIso ?? '') ?? Date.now()
      if (scheduledMs <= nowMs - SCHEDULED_AT_PAST_TOLERANCE_MS) {
        return rejected(
          `update_plan 执行失败：scheduled_at 必须晚于当前时间（now=${new Date(nowMs).toISOString()}）。`,
        )
      }
    }
  }
  return []
}
