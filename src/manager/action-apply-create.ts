import {
  ensureFocus,
  resolveDefaultFocusId,
  touchFocus,
} from '../focus/index.js'
import { appendTaskSystemMessage } from '../history/task-events.js'
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

import {
  markCreateAttempt,
} from './action-apply-guards.js'
import { runTaskSchema } from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { FocusId, WorkerProfile } from '../types/index.js'

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
  if (options?.suppressRunTask) return
  const parsed = runTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const profile: WorkerProfile = 'worker'
  const focusId = resolveActionFocusId(runtime, parsed.data.focus_id)
  const semanticKey = buildTaskSemanticKey({
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    profile,
    focusId,
  })
  const debounce = markCreateAttempt(runtime, semanticKey)
  if (debounce.debounced) return
  const dedupeKey = `${parsed.data.prompt}\n${parsed.data.title}\n${profile}\n${focusId}`
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
      focusId: activeSemanticTask.focusId,
    })
    const nextFingerprint = buildTaskFingerprint({
      prompt: parsed.data.prompt,
      title: parsed.data.title,
      profile,
      focusId,
    })
    if (activeFingerprint !== nextFingerprint) {
      await cancelTask(runtime, activeSemanticTask.id, {
        source: 'deferred',
        reason: 'superseded_by_newer_semantic_task',
      })
    } else if (activeSemanticTask.status === 'pending') {
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
    undefined,
    focusId,
  )
  if (!created) {
    if (task.status !== 'pending') return
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
    return
  }
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
  })
  await persistRuntimeState(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
}
