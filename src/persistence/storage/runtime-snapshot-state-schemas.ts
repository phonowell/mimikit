import { z } from 'zod'

import {
  choiceIdSchema,
  focusIdSchema,
  optionIdSchema,
} from '../../foundation/shared/id-schema.js'
import {
  FOCUS_STATUS_VALUES,
  MANAGER_WAKE_PROFILE_VALUES,
  TASK_RESULT_STATUS_VALUES,
} from '../../foundation/types/runtime-domain.js'

import {
  managerPacketModeSchema,
  managerPacketSectionSchema,
  managerSectionDigestSchema,
} from './manager-packet-schema.js'
import { taskPlanSchema } from './runtime-snapshot-plan-schemas.js'
import { taskSchema } from './runtime-snapshot-task-schemas.js'

const focusStatusSchema = z.enum(FOCUS_STATUS_VALUES)
const managerWakeProfileSchema = z.enum(MANAGER_WAKE_PROFILE_VALUES)
const taskResultStatusSchema = z.enum(TASK_RESULT_STATUS_VALUES)

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

export const managerContextPacketSchema = z
  .object({
    id: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    wakeProfile: managerWakeProfileSchema,
    mode: managerPacketModeSchema,
    counts: z
      .object({
        inputs: z.number().int().nonnegative(),
        results: z.number().int().nonnegative(),
        tasks: z.number().int().nonnegative(),
        plans: z.number().int().nonnegative(),
        workingFocuses: z.number().int().nonnegative(),
      })
      .strict(),
    latestUserInput: z
      .object({
        id: z.string().trim().min(1),
        focusId: focusIdSchema,
        text: z.string().trim().min(1),
      })
      .strict()
      .optional(),
    latestResult: z
      .object({
        taskId: z.string().trim().min(1),
        status: taskResultStatusSchema,
        focusId: focusIdSchema.optional(),
        summary: z.string().trim().min(1).optional(),
        stopReason: z.string().trim().min(1).optional(),
        archivePath: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
    activeTaskIds: z.array(z.string().trim().min(1)).optional(),
    activePlanIds: z.array(z.string().trim().min(1)).optional(),
    workingFocusIds: z.array(focusIdSchema).optional(),
    sectionDigests: z.array(managerSectionDigestSchema).optional(),
    includedSections: z.array(managerPacketSectionSchema),
    prunedSections: z.array(managerPacketSectionSchema),
  })
  .strict()

export const userChoiceOptionSchema = z
  .object({
    id: optionIdSchema,
    label: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict()

export const pendingUserChoiceEffectSchema = z
  .object({
    type: z.literal('resume_task'),
    taskId: z.string().trim().min(1),
    optionId: optionIdSchema,
    reason: z.string().trim().min(1).optional(),
  })
  .strict()

export const pendingUserChoiceSchema = z
  .object({
    id: choiceIdSchema,
    question: z.string().trim().min(1),
    options: z.array(userChoiceOptionSchema).min(2),
    defaultOptionId: optionIdSchema,
    createdAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1).optional(),
    focusId: focusIdSchema,
    effect: pendingUserChoiceEffectSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.options.some((item) => item.id === value.defaultOptionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'pendingUserChoices item defaultOptionId must exist in options',
      })
    }
  })

export const pendingUserChoicesSchema = z.array(pendingUserChoiceSchema)

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
    feishuChatId: z.string().trim().min(1).optional(),
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
    pendingUserChoices: pendingUserChoicesSchema.optional(),
    memoryRefresh: memoryRefreshSchema.optional(),
  })
  .strict()

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>
