import { queryHistorySchema } from '../history/query.js'

import {
  askUserChoiceSchema,
  cancelSchema,
  createPlanSchema,
  parseAskUserChoiceAttrs,
  queryTaskArchiveSchema,
  readFileSchema,
  runTaskSchema,
  summarizeSchema,
  updatePlanSchema,
} from './action-apply-schema.js'
import {
  formatAskUserChoiceInvalidOptionsHint,
  formatAskUserChoiceQqUnsupportedHint,
  formatCancelTaskAlreadyCanceledHint,
  formatCancelTaskNotCancelableHint,
  formatCancelTaskNotFoundHint,
  formatPlanNotFoundHint,
  formatUpdatePlanDoneForbiddenHint,
} from './action-feedback-hints.js'
import {
  invalidArgsIssue,
  rejected,
  validateIsoRangeField,
  validateScheduledAtNotPast,
  type ValidationIssue,
} from './action-validation-helpers.js'
import { queryContextSchema } from './query-context-tool.js'

import type { Parsed } from '../actions/model/spec.js'
import type { TaskPlanStatus, TaskStatus } from '../types/index.js'
import type { ZodSchema } from 'zod'
export type FeedbackContext = {
  taskStatusById?: Map<string, TaskStatus>
  planStatusById?: Map<string, TaskPlanStatus>
  resultTaskIds?: Set<string>
  scheduleNowIso?: string
  allowAskUserChoice?: boolean
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
  context.scheduleNowIso !== undefined
    ? { scheduleNowIso: context.scheduleNowIso }
    : {}
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
  if (!taskStatus) return rejected(formatCancelTaskNotFoundHint())
  if (taskStatus === 'pending' || taskStatus === 'running') return []
  if (taskStatus === 'canceled')
    return rejected(formatCancelTaskAlreadyCanceledHint())
  return rejected(formatCancelTaskNotCancelableHint())
}
export const validateQueryHistory = (item: Parsed): ValidationIssue[] =>
  validateRangeQueryWithSchema(item, queryHistorySchema)
export const validateQueryContext = (item: Parsed): ValidationIssue[] =>
  validateRangeQueryWithSchema(item, queryContextSchema)
export const validateReadFile = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, readFileSchema)
export const validateQueryTaskArchive = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, queryTaskArchiveSchema)
export const validateSummarizeTaskResult = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = summarizeSchema.safeParse(item.attrs)
  if (!parsed.success) return [invalidArgsIssue(parsed.error)]
  const { resultTaskIds } = context
  if (!resultTaskIds) return []
  if (resultTaskIds.has(parsed.data.task_id)) return []
  const available = [...resultTaskIds].slice(0, 3)
  const availableHint =
    available.length > 0
      ? `当前批次可用 task_id: ${available.join(', ')}。`
      : '当前批次无可摘要的 task_result。'
  return rejected(
    `summarize_task_result 执行失败：task_id 不在当前批次结果中。${availableHint}`,
  )
}
export const validateAskUserChoice = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  if (context.allowAskUserChoice === false)
    return rejected(formatAskUserChoiceQqUnsupportedHint())

  const issues = validateWithSchema(item, askUserChoiceSchema)
  if (issues.length > 0) return issues
  if (parseAskUserChoiceAttrs(item.attrs)) return []
  return rejected(formatAskUserChoiceInvalidOptionsHint())
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
  if (!status) return rejected(formatPlanNotFoundHint(action))
  if (action === 'update_plan' && status === 'done') {
    const keys = new Set(Object.keys(item.attrs))
    const isLastTaskPatch =
      keys.size > 0 &&
      [...keys].every((key) => key === 'id' || key === 'last_task_id') &&
      typeof item.attrs.last_task_id === 'string' &&
      item.attrs.last_task_id.trim().length > 0
    if (isLastTaskPatch) return []
    return rejected(formatUpdatePlanDoneForbiddenHint())
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
  if (parsed.data.trigger_mode !== 'scheduled_at' || !scheduledAt) return []
  return validateScheduledAtNotPast({
    action: 'update_plan',
    scheduledAt,
    ...resolveScheduleNowOption(context),
  })
}
