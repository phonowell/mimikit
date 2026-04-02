import { nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyWorkerLoop } from '../../kernel/orchestrator/signals.js'
import { appendTaskSystemMessage } from '../../persistence/history/task-events.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { pauseRuntimeTask } from '../../work/orchestrator/task-state-write.js'

import {
  buildTaskMutationMetaFields,
  isDoneTaskStatus,
  resolveTaskLookupTarget,
  touchTaskMutation,
} from './task-action.js'
import { resolveSlotStatus, resolveTaskChangeAt } from './task-state-shared.js'

import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type PauseMeta = {
  source?: string
  reason?: string
}

export type PauseResult = {
  ok: boolean
  id: string
  status: 'paused' | 'not_found' | 'already_done' | 'already_paused' | 'invalid'
  changeAt?: string
}

export const pauseTask = async (
  runtime: WorkerRuntime,
  taskId: string,
  meta?: PauseMeta,
): Promise<PauseResult> => {
  const lookup = resolveTaskLookupTarget(runtime, taskId)
  if ('status' in lookup)
    return { ok: false, id: lookup.id, status: lookup.status }
  const { task } = lookup
  if (task.status === 'paused') {
    return {
      ok: false,
      id: task.id,
      status: 'already_paused',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  if (isDoneTaskStatus(task.status)) {
    return {
      ok: false,
      id: task.id,
      status: 'already_done',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  const pausedAt = nowIso()
  const prevStatus = task.status
  touchTaskMutation(runtime, task.id)
  pauseRuntimeTask({ runtime, taskId: task.id, pausedAt })
  const controller = runtime.process.worker.runningControllers.get(task.id)
  if (controller && !controller.signal.aborted)
    controller.abort(meta?.reason ?? 'Task paused')

  await appendTaskSystemMessage(runtime.paths.history, 'paused', task, {
    createdAt: pausedAt,
    slotStatus: resolveSlotStatus(runtime),
  })
  await bestEffort('appendLog: task_paused', () =>
    appendLog(runtime.paths.log, {
      event: 'task_paused',
      taskId: task.id,
      prevStatus,
      ...buildTaskMutationMetaFields(meta),
    }),
  )
  await bestEffort('persistRuntimeState: task_paused', () =>
    persistRuntimeState(runtime),
  )
  notifyWorkerLoop(runtime)
  return {
    ok: true,
    id: task.id,
    status: 'paused',
    changeAt: pausedAt,
  }
}
