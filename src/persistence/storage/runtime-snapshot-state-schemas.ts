import { z } from 'zod'

import { FOCUS_STATUS_VALUES } from '../../foundation/types/runtime-domain.js'

import { taskPlanSchema } from './runtime-snapshot-plan-schemas.js'
import { taskSchema } from './runtime-snapshot-task-schemas.js'

const focusStatusSchema = z.enum(FOCUS_STATUS_VALUES)

export const focusMetaSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string(),
    status: focusStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    lastActivityAt: z.string(),
    summary: z.string().trim().min(1).optional(),
    openItems: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()

const memoryRefreshSchema = z
  .object({
    lastCompletedTurn: z.number().int().nonnegative(),
    signalVersion: z.number().int().nonnegative(),
    lastProcessedSignalVersion: z.number().int().nonnegative(),
    lastRunAt: z.string().trim().min(1).optional(),
  })
  .strict()

const channelTargetsSchema = z
  .object({
    telegramChatId: z.string().trim().min(1).optional(),
  })
  .strict()

export const runtimeSnapshotSchema = z
  .object({
    schemaVersion: z.string().trim().min(1),
    tasks: z.array(taskSchema),
    taskPlans: z.array(taskPlanSchema),
    focuses: z.array(focusMetaSchema).optional(),
    managerTurn: z.number().int().nonnegative().optional(),
    managerThreadId: z.string().trim().min(1).optional(),
    queues: z
      .object({
        inputsCursor: z.number().int().nonnegative(),
        resultsCursor: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    channelTargets: channelTargetsSchema.optional(),
    memoryRefresh: memoryRefreshSchema.optional(),
  })
  .strict()

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>
