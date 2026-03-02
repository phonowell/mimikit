import { queryHistorySchema } from '../history/query.js'
import { queryMemorySchema } from '../memory/query.js'

import {
  invalidArgsIssue,
  rejected,
  validateIsoRangeField,
  validateScheduledAtNotPast,
  type ValidationIssue,
} from './action-validation-helpers.js'
import {
  cancelSchema,
  compressContextSchema,
  createPlanSchema,
  readFileSchema,
  runTaskSchema,
  updatePlanSchema,
  writeMemorySchema,
  writeProfileSchema,
} from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { TaskPlanStatus, TaskStatus } from '../types/index.js'
import type { ZodSchema } from 'zod'

export type FeedbackContext = {
  taskStatusById?: Map<string, TaskStatus>
  planStatusById?: Map<string, TaskPlanStatus>
  hasCompressibleContext?: boolean
  scheduleNowIso?: string
}

export type { ValidationIssue } from './action-validation-helpers.js'

export const validateWithSchema = (
  item: Parsed,
  schema: ZodSchema,
): ValidationIssue[] => {
  const parsed = schema.safeParse(item.attrs)
  return parsed.success ? [] : [invalidArgsIssue(parsed.error)]
}

const resolveScheduleNowOption = (
  context: FeedbackContext,
): { scheduleNowIso?: string } =>
  context.scheduleNowIso !== undefined ? { scheduleNowIso: context.scheduleNowIso } : {}

const validateIsoRange = (
  from: string | undefined,
  to: string | undefined,
): ValidationIssue[] => {
  const fromIssues = validateIsoRangeField('from', from)
  return fromIssues.length > 0 ? fromIssues : validateIsoRangeField('to', to)
}

const validateRangeQueryWithSchema = (
  item: Parsed,
  schema: ZodSchema<{ from?: string | undefined; to?: string | undefined }>,
): ValidationIssue[] => {
  const parsed = schema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  return validateIsoRange(parsed.data.from, parsed.data.to)
}

export const validateRunTask = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, runTaskSchema)

export const validateCreatePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = createPlanSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  if (
    parsed.data.trigger_mode !== 'scheduled_at' ||
    !parsed.data.scheduled_at?.trim()
  )
    return []

  return validateScheduledAtNotPast({
    action: 'create_plan',
    scheduledAt: parsed.data.scheduled_at,
    ...resolveScheduleNowOption(context),
  })
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

export const validateQueryHistory = (item: Parsed): ValidationIssue[] =>
  validateRangeQueryWithSchema(item, queryHistorySchema)

export const validateReadFile = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, readFileSchema)

export const validateQueryMemory = (item: Parsed): ValidationIssue[] =>
  validateRangeQueryWithSchema(item, queryMemorySchema)

export const validateWriteProfile = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, writeProfileSchema)

export const validateWriteMemory = (item: Parsed): ValidationIssue[] => {
  const parsed = writeMemorySchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const expiresAt = parsed.data.expires_at?.trim()
  if (!expiresAt) return []
  if (validateIsoRangeField('to', expiresAt).length === 0) return []
  return [{ error: 'invalid_action_args', hint: '参数校验失败：expires_at 必须是合法 ISO 8601 时间。' }]
}

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

  if (resolvedMode !== 'scheduled_at' || !scheduledAt) return []

  return validateScheduledAtNotPast({
    action: 'update_plan',
    scheduledAt,
    ...resolveScheduleNowOption(context),
  })
}
