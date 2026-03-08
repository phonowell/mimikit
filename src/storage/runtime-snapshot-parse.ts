import { stripUndefined } from '../shared/utils.js'

import {
  isRuntimeSnapshotSchemaVersionSupported,
  RUNTIME_SNAPSHOT_SCHEMA_VERSION,
} from './runtime-schema-version.js'
import {
  type focusContextSchema,
  type focusMetaSchema,
  type managerFocusCompressedContextSchema,
  type pendingUserChoiceSchema,
  type RuntimeSnapshot,
  runtimeSnapshotSchema,
  type taskPlanSchema,
  type taskSchema,
} from './runtime-snapshot-schema.js'
import { normalizeTokenUsage } from './token-usage.js'

import type { z } from 'zod'

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
          handoff: task.result.handoff
            ? stripUndefined({
                ...task.result.handoff,
                decisions: task.result.handoff.decisions
                  ? [...task.result.handoff.decisions]
                  : undefined,
                nextSteps: task.result.handoff.nextSteps
                  ? [...task.result.handoff.nextSteps]
                  : undefined,
                risks: task.result.handoff.risks
                  ? [...task.result.handoff.risks]
                  : undefined,
                artifacts: task.result.handoff.artifacts
                  ? task.result.handoff.artifacts.map((item) =>
                      stripUndefined({ ...item }),
                    )
                  : undefined,
                evidence: task.result.handoff.evidence
                  ? task.result.handoff.evidence.map((item) =>
                      stripUndefined({ ...item }),
                    )
                  : undefined,
              })
            : undefined,
          evidence: task.result.evidence
            ? stripUndefined({
                ...task.result.evidence,
                acceptanceChecks: task.result.evidence.acceptanceChecks.map(
                  (item) => stripUndefined({ ...item }),
                ),
                stateDelta: stripUndefined({
                  ...task.result.evidence.stateDelta,
                }),
                nextSteps: task.result.evidence.nextSteps
                  ? [...task.result.evidence.nextSteps]
                  : undefined,
                risks: task.result.evidence.risks
                  ? [...task.result.evidence.risks]
                  : undefined,
              })
            : undefined,
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
  stripUndefined({
    ...item,
    details: item.details
      ? stripUndefined({
          ...item.details,
          taskIds: item.details.taskIds ? [...item.details.taskIds] : undefined,
          archivePaths: item.details.archivePaths
            ? [...item.details.archivePaths]
            : undefined,
        })
      : undefined,
  }) as SnapshotManagerFocusCompressedContext

const normalizePendingUserChoice = (
  choice: SnapshotPendingUserChoice,
): SnapshotPendingUserChoice =>
  stripUndefined({
    ...choice,
    options: choice.options.map((item) => stripUndefined({ ...item })),
  }) as SnapshotPendingUserChoice

const normalizeRuntimeSnapshot = (value: RuntimeSnapshot): RuntimeSnapshot =>
  stripUndefined({
    schemaVersion: value.schemaVersion,
    tasks: value.tasks.map(normalizeTask),
    taskPlans: value.taskPlans.map(normalizeTaskPlan),
    focuses: value.focuses?.map(normalizeFocusMeta),
    focusContexts: value.focusContexts?.map(normalizeFocusContext),
    activeFocusIds: value.activeFocusIds,
    managerTurn: value.managerTurn,
    managerThreadId: value.managerThreadId,
    queues: value.queues,
    managerCompressedContext: value.managerCompressedContext,
    managerFocusCompressedContexts: value.managerFocusCompressedContexts?.map(
      normalizeManagerFocusCompressedContext,
    ),
    pendingUserChoice: value.pendingUserChoice
      ? normalizePendingUserChoice(value.pendingUserChoice)
      : undefined,
    memoryRefresh: value.memoryRefresh,
  }) as RuntimeSnapshot

export const parseRuntimeSnapshot = (value: unknown): RuntimeSnapshot => {
  const parsed = runtimeSnapshotSchema.parse(value)
  if (!isRuntimeSnapshotSchemaVersionSupported(parsed.schemaVersion)) {
    throw new Error(
      `runtime snapshot schema version not supported: ${parsed.schemaVersion}; current=${RUNTIME_SNAPSHOT_SCHEMA_VERSION}`,
    )
  }
  return normalizeRuntimeSnapshot(parsed)
}
