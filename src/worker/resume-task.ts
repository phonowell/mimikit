import { appendTaskSystemMessage } from '../history/task-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { nowIso } from '../shared/utils.js'

import { enqueueWorkerTask } from './dispatch.js'
import {
  isDoneTaskStatus,
  resolveTaskLookup,
  touchTaskMutation,
} from './task-action.js'
import { resolveSlotStatus, resolveTaskChangeAt } from './task-state-shared.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export type ResumeMeta = {
  source?: string
  reason?: string
}

export type ResumeResult = {
  ok: boolean
  id: string
  status: 'pending' | 'not_found' | 'already_done' | 'not_paused' | 'invalid'
  changeAt?: string
}

export const resumeTask = async (
  runtime: RuntimeState,
  taskId: string,
  meta?: ResumeMeta,
): Promise<ResumeResult> => {
  const lookup = resolveTaskLookup(runtime, taskId)
  if (!lookup.normalizedId)
    return { ok: false, id: lookup.normalizedId, status: 'invalid' }
  const { task } = lookup
  if (!task) return { ok: false, id: lookup.normalizedId, status: 'not_found' }
  if (isDoneTaskStatus(task.status)) {
    return {
      ok: false,
      id: task.id,
      status: 'already_done',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  if (task.status !== 'paused') {
    return {
      ok: false,
      id: task.id,
      status: 'not_paused',
      changeAt: resolveTaskChangeAt(task),
    }
  }

  const resumedAt = nowIso()
  touchTaskMutation(runtime, task.id)
  task.status = 'pending'
  delete task.pausedAt
  delete task.startedAt
  delete task.completedAt
  delete task.durationMs

  await appendTaskSystemMessage(runtime.paths.history, 'resumed', task, {
    createdAt: resumedAt,
    slotStatus: resolveSlotStatus(runtime),
  })
  await bestEffort('appendLog: task_resumed', () =>
    appendLog(runtime.paths.log, {
      event: 'task_resumed',
      taskId: task.id,
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.reason ? { reason: meta.reason } : {}),
    }),
  )
  await bestEffort('persistRuntimeState: task_resumed', () =>
    persistRuntimeState(runtime),
  )
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
  return {
    ok: true,
    id: task.id,
    status: 'pending',
    changeAt: resumedAt,
  }
}
