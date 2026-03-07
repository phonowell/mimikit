import {
  ensureFocus,
  resolveDefaultFocusId,
  touchFocus,
} from '../focus/index.js'
import { appendTaskSystemMessage } from '../history/task-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'

import { markCreateAttempt } from './action-apply-guards.js'
import { runTaskSchema } from './action-apply-schema.js'
import {
  resolveWorkerSlotCapacity,
  toWorkerSlotStatusPayload,
} from './loop-trigger-shared.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
  cancelTask,
  enqueueTask,
  enqueueWorkerTask,
  findActiveTaskBySemanticKey,
  notifyWorkerLoop,
  persistRuntimeState,
  type RuntimeState,
} from './runtime-adapter.js'
import { resolvePreferredWorkerProvider } from './worker-provider-selection.js'

import type { Parsed } from '../actions/model/spec.js'
import type { FocusId, WorkerProfile, WorkerProvider } from '../types/index.js'

export type ApplyTaskActionsOptions = {
  suppressRunTask?: boolean
}

export const resolveActionFocusId = (
  runtime: RuntimeState,
  actionFocusId?: string,
): FocusId => {
  const trimmed = actionFocusId?.trim()
  const focusId =
    trimmed && trimmed.length > 0 ? trimmed : resolveDefaultFocusId(runtime)
  ensureFocus(runtime, focusId)
  touchFocus(runtime, focusId)
  return focusId
}

export const applyRunTask = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  const logRunTaskDispatch = async (params: {
    taskId: string
    mode: 'reuse_pending' | 'created'
  }): Promise<void> => {
    const slots = resolveWorkerSlotCapacity(runtime)
    await bestEffort('appendLog: run_task_dispatch', () =>
      appendLog(runtime.paths.log, {
        event: 'run_task_dispatch',
        taskId: params.taskId,
        mode: params.mode,
        availableSlots: slots.availableSlots,
        occupiedSlots: slots.occupiedSlots,
        maxSlots: slots.maxSlots,
      }),
    )
  }

  if (options?.suppressRunTask) return
  const parsed = runTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const profile: WorkerProfile = 'worker'
  const provider: WorkerProvider =
    parsed.data.provider ??
    resolvePreferredWorkerProvider(runtime.config) ??
    'codex'
  const focusId = resolveActionFocusId(runtime, parsed.data.focus_id)
  const semanticKey = buildTaskSemanticKey({
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    profile,
    provider,
    focusId,
  })
  const debounce = markCreateAttempt(runtime, semanticKey)
  if (debounce.debounced) return
  const dedupeKey = `${parsed.data.prompt}\n${parsed.data.title}\n${profile}\n${provider}\n${focusId}`
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)

  const activeSemanticTask = findActiveTaskBySemanticKey(
    runtime.tasks,
    semanticKey,
  )
  if (activeSemanticTask) {
    const activeFingerprint = buildTaskFingerprint({
      prompt: activeSemanticTask.prompt,
      title: activeSemanticTask.title,
      profile: activeSemanticTask.profile,
      provider: activeSemanticTask.provider,
      focusId: activeSemanticTask.focusId,
    })
    const nextFingerprint = buildTaskFingerprint({
      prompt: parsed.data.prompt,
      title: parsed.data.title,
      profile,
      provider,
      focusId,
    })
    if (activeFingerprint !== nextFingerprint) {
      await cancelTask(runtime, activeSemanticTask.id, {
        source: 'deferred',
        reason: 'superseded_by_newer_semantic_task',
      })
    } else if (activeSemanticTask.status === 'pending') {
      await logRunTaskDispatch({
        taskId: activeSemanticTask.id,
        mode: 'reuse_pending',
      })
      enqueueWorkerTask(runtime, activeSemanticTask)
      notifyWorkerLoop(runtime)
      return
    } else return
  }

  const { task, created } = enqueueTask(
    runtime.tasks,
    parsed.data.prompt,
    parsed.data.title,
    profile,
    provider,
    undefined,
    focusId,
  )
  if (!created) {
    if (task.status !== 'pending') return
    await logRunTaskDispatch({ taskId: task.id, mode: 'reuse_pending' })
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
    return
  }
  const slotStatus = toWorkerSlotStatusPayload(
    resolveWorkerSlotCapacity(runtime),
  )
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
    slotStatus,
  })
  await logRunTaskDispatch({ taskId: task.id, mode: 'created' })
  await persistRuntimeState(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
}
