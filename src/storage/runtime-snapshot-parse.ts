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

type ParseRuntimeSnapshotResult = {
  snapshot: RuntimeSnapshot
  migratedLegacyPlanTriggerMode: boolean
}

const LEGACY_TRIGGER_MODE = 'on_worker_slot_available'
const NEXT_TRIGGER_MODE = 'on_worker_slot_freed'

const migrateLegacyPlanTriggerMode = (
  value: unknown,
): { value: unknown; migrated: boolean } => {
  if (!value || typeof value !== 'object') return { value, migrated: false }
  const root = value as { taskPlans?: unknown }
  if (!Array.isArray(root.taskPlans)) return { value, migrated: false }

  let migrated = false
  const taskPlans = root.taskPlans.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry
    const plan = entry as { trigger?: unknown }
    if (!plan.trigger || typeof plan.trigger !== 'object') return entry
    const trigger = plan.trigger as { mode?: unknown }
    if (trigger.mode !== LEGACY_TRIGGER_MODE) return entry
    migrated = true
    return {
      ...(entry as Record<string, unknown>),
      trigger: {
        ...(trigger as Record<string, unknown>),
        mode: NEXT_TRIGGER_MODE,
      },
    }
  })
  if (!migrated) return { value, migrated: false }
  return {
    value: {
      ...(value as Record<string, unknown>),
      taskPlans,
    },
    migrated: true,
  }
}

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

const normalizeRuntimeSnapshot = (value: RuntimeSnapshot): RuntimeSnapshot =>
  stripUndefined({
    tasks: value.tasks.map(normalizeTask),
    taskPlans: value.taskPlans.map(normalizeTaskPlan),
    focuses: value.focuses?.map(normalizeFocusMeta),
    focusContexts: value.focusContexts?.map(normalizeFocusContext),
    activeFocusIds: value.activeFocusIds,
    managerTurn: value.managerTurn,
    queues: value.queues,
    managerFocusCompressedContexts: value.managerFocusCompressedContexts?.map(
      normalizeManagerFocusCompressedContext,
    ),
    pendingUserChoice: value.pendingUserChoice
      ? normalizePendingUserChoice(value.pendingUserChoice)
      : undefined,
    memoryRefresh: value.memoryRefresh,
  }) as RuntimeSnapshot

export const parseRuntimeSnapshot = (value: unknown): ParseRuntimeSnapshotResult => {
  const migrated = migrateLegacyPlanTriggerMode(value)
  const parsed = runtimeSnapshotSchema.parse(migrated.value)
  return {
    snapshot: normalizeRuntimeSnapshot(parsed),
    migratedLegacyPlanTriggerMode: migrated.migrated,
  }
}

export type { ParseRuntimeSnapshotResult }
