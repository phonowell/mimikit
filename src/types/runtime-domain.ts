import { z } from 'zod'

const parseSchemaValue = <T>(schema: z.ZodType<T>, value: unknown) => {
  const result = schema.safeParse(value)
  return result.success ? result.data : undefined
}

export const WORKER_PROVIDER_VALUES = ['codex'] as const
export const TASK_STATUS_VALUES = [
  'pending',
  'paused',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const
export const TASK_RESULT_STATUS_VALUES = [
  'succeeded',
  'failed',
  'canceled',
  'partial',
] as const
export const TASK_CANCEL_SOURCE_VALUES = ['user', 'deferred', 'system'] as const
export const TASK_RESULT_OUTCOME_VALUES = [
  'completed',
  'partial',
  'blocked',
] as const
export const TASK_RESULT_STOP_REASON_VALUES = [
  'completed',
  'budget_exhausted',
  'guard_rejected',
  'input_required',
  'failed',
  'canceled',
] as const
export const TASK_PLAN_STATUS_VALUES = ['active', 'blocked', 'done'] as const
export const TASK_PLAN_TRIGGER_MODE_VALUES = [
  'cron',
  'scheduled_at',
  'on_worker_slot_freed',
] as const
export const FOCUS_STATUS_VALUES = ['active', 'idle', 'done', 'archived'] as const
export const MANAGER_WAKE_PROFILE_VALUES = [
  'user_input',
  'task_result',
  'trigger',
  'capacity',
  'mixed',
] as const

const workerProviderSchema = z.enum(WORKER_PROVIDER_VALUES)
const taskStatusSchema = z.enum(TASK_STATUS_VALUES)
const taskResultStatusSchema = z.enum(TASK_RESULT_STATUS_VALUES)
const taskCancelSourceSchema = z.enum(TASK_CANCEL_SOURCE_VALUES)
const taskResultOutcomeSchema = z.enum(TASK_RESULT_OUTCOME_VALUES)
const taskResultStopReasonSchema = z.enum(TASK_RESULT_STOP_REASON_VALUES)

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number]
export type TaskCancelSource = (typeof TASK_CANCEL_SOURCE_VALUES)[number]
export type TaskResultStatus = (typeof TASK_RESULT_STATUS_VALUES)[number]
export type TaskResultOutcome = (typeof TASK_RESULT_OUTCOME_VALUES)[number]
export type TaskResultStopReason = (typeof TASK_RESULT_STOP_REASON_VALUES)[number]
export type WorkerProvider = (typeof WORKER_PROVIDER_VALUES)[number]
export type TaskPlanStatus = (typeof TASK_PLAN_STATUS_VALUES)[number]
export type TaskPlanTriggerMode = (typeof TASK_PLAN_TRIGGER_MODE_VALUES)[number]
export type FocusStatus = (typeof FOCUS_STATUS_VALUES)[number]
export type ManagerWakeProfile = (typeof MANAGER_WAKE_PROFILE_VALUES)[number]

export const parseTaskStatus = (value: unknown): TaskStatus | undefined =>
  parseSchemaValue(taskStatusSchema, value)

export const parseTaskCancelSource = (
  value: unknown,
): TaskCancelSource | undefined =>
  parseSchemaValue(taskCancelSourceSchema, value)

export const parseTaskResultStatus = (
  value: unknown,
): TaskResultStatus | undefined =>
  parseSchemaValue(taskResultStatusSchema, value)

export const parseTaskResultOutcome = (
  value: unknown,
): TaskResultOutcome | undefined =>
  parseSchemaValue(taskResultOutcomeSchema, value)

export const parseTaskResultStopReason = (
  value: unknown,
): TaskResultStopReason | undefined =>
  parseSchemaValue(taskResultStopReasonSchema, value)

export const parseWorkerProvider = (
  value: unknown,
): WorkerProvider | undefined =>
  parseSchemaValue(workerProviderSchema, value)
