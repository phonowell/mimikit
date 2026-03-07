import {
  askUserChoiceSchema,
  createPlanSchema,
  mutateTaskSchema,
  parseAskUserChoiceAttrs,
  readFileSchema,
  rememberMemorySchema,
  runTaskSchema,
  summarizeSchema,
  updatePlanSchema,
} from './action-apply-schema.js'
import {
  formatAskUserChoiceChannelUnsupportedHint,
  formatAskUserChoiceInvalidOptionsHint,
  formatEnqueueTaskProviderDisabledHint,
  formatMutateTaskAlreadyCanceledHint,
  formatMutateTaskAlreadyDoneHint,
  formatMutateTaskAlreadyPausedHint,
  formatMutateTaskNotFoundHint,
  formatMutateTaskNotPausedHint,
  formatPlanNotFoundHint,
  formatSetTaskResultSummaryTaskNotInBatchHint,
  formatUpdatePlanDoneForbiddenHint,
} from './action-feedback-hints.js'
import { parseActionAttrs } from './action-parse.js'
import {
  invalidArgsIssue,
  rejected,
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
  enabledWorkerProviders?: Set<'codex' | 'opencode'>
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
export const validateRunTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, runTaskSchema)
  if (!parsed) return validateWithSchema(item, runTaskSchema)
  const { provider } = parsed
  if (!provider) return []
  const enabledProviders = context.enabledWorkerProviders
  if (!enabledProviders || enabledProviders.has(provider)) return []
  return rejected(formatEnqueueTaskProviderDisabledHint(provider))
}
export const validateCreatePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, createPlanSchema)
  if (!parsed) return validateWithSchema(item, createPlanSchema)
  if (parsed.trigger_mode !== 'scheduled_at' || !parsed.scheduled_at?.trim())
    return []
  return validateScheduledAtNotPast({
    action: 'create_plan',
    scheduledAt: parsed.scheduled_at,
    ...resolveScheduleNowOption(context),
  })
}
export const validateMutateTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, mutateTaskSchema)
  if (!parsed) return validateWithSchema(item, mutateTaskSchema)
  const { id, op } = parsed
  const taskStatus = context.taskStatusById?.get(id)
  if (!taskStatus) return rejected(formatMutateTaskNotFoundHint())

  if (op === 'pause') {
    if (taskStatus === 'pending' || taskStatus === 'running') return []
    if (taskStatus === 'paused')
      return rejected(formatMutateTaskAlreadyPausedHint())
    return rejected(formatMutateTaskAlreadyDoneHint('pause'))
  }

  if (op === 'resume') {
    if (taskStatus === 'paused') return []
    if (
      taskStatus === 'succeeded' ||
      taskStatus === 'failed' ||
      taskStatus === 'canceled'
    )
      return rejected(formatMutateTaskAlreadyDoneHint('resume'))
    return rejected(formatMutateTaskNotPausedHint())
  }

  if (
    taskStatus === 'pending' ||
    taskStatus === 'paused' ||
    taskStatus === 'running'
  )
    return []
  if (taskStatus === 'canceled')
    return rejected(formatMutateTaskAlreadyCanceledHint())
  return rejected(formatMutateTaskAlreadyDoneHint('cancel'))
}
export const validateQueryContext = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, queryContextSchema)
export const validateReadFile = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, readFileSchema)
export const validateRememberMemory = (item: Parsed): ValidationIssue[] =>
  validateWithSchema(item, rememberMemorySchema)
export const validateSummarizeTaskResult = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, summarizeSchema)
  if (!parsed) return validateWithSchema(item, summarizeSchema)
  const { resultTaskIds } = context
  if (!resultTaskIds) return []
  if (resultTaskIds.has(parsed.task_id)) return []
  const available = [...resultTaskIds].slice(0, 3)
  const availableHint =
    available.length > 0
      ? `当前批次可用 task_id: ${available.join(', ')}。`
      : '当前批次无可摘要的 task_result。'
  return rejected(formatSetTaskResultSummaryTaskNotInBatchHint(availableHint))
}
export const validateAskUserChoice = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  if (context.allowAskUserChoice === false)
    return rejected(formatAskUserChoiceChannelUnsupportedHint())

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
  const parsed = parseActionAttrs(item, updatePlanSchema)
  if (!parsed) return validateWithSchema(item, updatePlanSchema)
  const scheduledAt = parsed.scheduled_at?.trim()
  if (parsed.trigger_mode !== 'scheduled_at' || !scheduledAt) return []
  return validateScheduledAtNotPast({
    action: 'update_plan',
    scheduledAt,
    ...resolveScheduleNowOption(context),
  })
}
