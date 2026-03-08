import { appendTaskSystemMessage } from '../history/task-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { markTaskPaused } from '../orchestrator/core/task-lifecycle.js'
import { nowIso } from '../shared/utils.js'

import {
  buildTaskMutationMetaFields,
  isDoneTaskStatus,
  resolveTaskLookupTarget,
  touchTaskMutation,
} from './task-action.js'
import { resolveSlotStatus, resolveTaskChangeAt } from './task-state-shared.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

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
  runtime: RuntimeState,
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
  markTaskPaused(runtime.tasks, task.id, { pausedAt })
  const controller = runtime.runningControllers.get(task.id)
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
