import {
  taskCancelSchema,
  taskResultSchema,
  taskSchema,
} from '../storage/runtime-snapshot-schema.js'

import type {
  focusMetaSchema,
  managerContextPacketSchema,
  taskPlanSchema,
  taskPlanTriggerSchema,
} from '../storage/runtime-snapshot-schema.js'
import type { z } from 'zod'

const parseSchemaValue = <T>(schema: z.ZodType<T>, value: unknown) => {
  const result = schema.safeParse(value)
  return result.success ? result.data : undefined
}

export type TaskStatus = z.infer<typeof taskSchema>['status']
export type TaskCancelSource = z.infer<typeof taskCancelSchema>['source']
export type TaskResultStatus = z.infer<typeof taskResultSchema>['status']
export type TaskResultOutcome = NonNullable<
  z.infer<typeof taskResultSchema>['outcome']
>
export type TaskResultStopReason = NonNullable<
  z.infer<typeof taskResultSchema>['stopReason']
>
export type WorkerProvider = z.infer<typeof taskSchema>['provider']
export type TaskPlanStatus = z.infer<typeof taskPlanSchema>['status']
export type TaskPlanTriggerMode = z.infer<typeof taskPlanTriggerSchema>['mode']
export type FocusStatus = z.infer<typeof focusMetaSchema>['status']
export type ManagerWakeProfile = z.infer<
  typeof managerContextPacketSchema
>['wakeProfile']

export const parseTaskStatus = (value: unknown): TaskStatus | undefined =>
  parseSchemaValue(taskSchema.shape.status, value)

export const parseTaskCancelSource = (
  value: unknown,
): TaskCancelSource | undefined =>
  parseSchemaValue(taskCancelSchema.shape.source, value)

export const parseTaskResultStatus = (
  value: unknown,
): TaskResultStatus | undefined =>
  parseSchemaValue(taskResultSchema.shape.status, value)

export const parseTaskResultOutcome = (
  value: unknown,
): TaskResultOutcome | undefined =>
  parseSchemaValue(taskResultSchema.shape.outcome, value)

export const parseTaskResultStopReason = (
  value: unknown,
): TaskResultStopReason | undefined =>
  parseSchemaValue(taskResultSchema.shape.stopReason, value)

export const parseWorkerProvider = (
  value: unknown,
): WorkerProvider | undefined =>
  parseSchemaValue(taskSchema.shape.provider, value)
