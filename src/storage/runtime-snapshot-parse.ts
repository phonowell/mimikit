import { z } from 'zod'

import { stripUndefined } from '../shared/utils.js'

import {
  focusContextSchema,
  focusMetaSchema,
  managerFocusCompressedContextSchema,
  pendingUserChoiceSchema,
  runtimeSnapshotSchema,
  taskPlanSchema,
  taskSchema,
  type RuntimeSnapshot,
} from './runtime-snapshot-schema.js'
import { normalizeTokenUsage } from './token-usage.js'

type SnapshotTask = z.infer<typeof taskSchema>
type SnapshotTaskPlan = z.infer<typeof taskPlanSchema>
type SnapshotFocusMeta = z.infer<typeof focusMetaSchema>
type SnapshotFocusContext = z.infer<typeof focusContextSchema>
type SnapshotManagerFocusCompressedContext = z.infer<
  typeof managerFocusCompressedContextSchema
>
type SnapshotPendingUserChoice = z.infer<typeof pendingUserChoiceSchema>

const normalizeTask = (task: SnapshotTask): SnapshotTask =>
  stripUndefined({
    ...task,
    usage: normalizeTokenUsage(task.usage),
    result: task.result
      ? stripUndefined({
          ...task.result,
          usage: normalizeTokenUsage(task.result.usage),
        })
      : undefined,
  }) as SnapshotTask

const normalizeTaskPlan = (item: SnapshotTaskPlan): SnapshotTaskPlan =>
  stripUndefined({ ...item }) as SnapshotTaskPlan

const normalizeFocusMeta = (focus: SnapshotFocusMeta): SnapshotFocusMeta =>
  stripUndefined({ ...focus }) as SnapshotFocusMeta

const normalizeFocusContext = (
  focusContext: SnapshotFocusContext,
): SnapshotFocusContext =>
  stripUndefined({ ...focusContext }) as SnapshotFocusContext

const normalizeManagerFocusCompressedContext = (
  item: SnapshotManagerFocusCompressedContext,
): SnapshotManagerFocusCompressedContext =>
  stripUndefined({ ...item }) as SnapshotManagerFocusCompressedContext

const normalizePendingUserChoice = (
  choice: SnapshotPendingUserChoice,
): SnapshotPendingUserChoice =>
  stripUndefined({
    ...choice,
    options: choice.options.map((item) => stripUndefined({ ...item })),
  }) as SnapshotPendingUserChoice

export const parseRuntimeSnapshot = (value: unknown): RuntimeSnapshot => {
  const parsed = runtimeSnapshotSchema.parse(value)
  return stripUndefined({
    tasks: parsed.tasks.map(normalizeTask),
    taskPlans: parsed.taskPlans.map(normalizeTaskPlan),
    focuses: parsed.focuses?.map(normalizeFocusMeta),
    focusContexts: parsed.focusContexts?.map(normalizeFocusContext),
    activeFocusIds: parsed.activeFocusIds,
    managerTurn: parsed.managerTurn,
    queues: parsed.queues,
    managerFocusCompressedContexts:
      parsed.managerFocusCompressedContexts?.map(
        normalizeManagerFocusCompressedContext,
      ),
    pendingUserChoice: parsed.pendingUserChoice
      ? normalizePendingUserChoice(parsed.pendingUserChoice)
      : undefined,
    memoryRefresh: parsed.memoryRefresh,
  }) as RuntimeSnapshot
}
