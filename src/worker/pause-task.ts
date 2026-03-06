import { appendTaskSystemMessage } from '../history/task-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { markTaskPaused } from '../orchestrator/core/task-lifecycle.js'
import { nowIso } from '../shared/utils.js'

import { clearTaskLiveOutput } from './live-output.js'

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

const resolveTaskChangeAt = (task: RuntimeState['tasks'][number]): string =>
  task.completedAt ?? task.pausedAt ?? task.startedAt ?? task.createdAt

const resolveSlotStatus = (runtime: RuntimeState) => {
  const maxSlots = runtime.config.worker.maxConcurrent
  const occupiedSlots = runtime.runningControllers.size
  return {
    max_slots: maxSlots,
    occupied_slots: occupiedSlots,
    available_slots: Math.max(0, maxSlots - occupiedSlots),
  }
}

export const pauseTask = async (
  runtime: RuntimeState,
  taskId: string,
  meta?: PauseMeta,
): Promise<PauseResult> => {
  const trimmed = taskId.trim()
  if (!trimmed) return { ok: false, id: trimmed, status: 'invalid' }
  const task = runtime.tasks.find((item) => item.id === trimmed)
  if (!task) return { ok: false, id: trimmed, status: 'not_found' }
  if (task.status === 'paused') {
    return {
      ok: false,
      id: task.id,
      status: 'already_paused',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  if (
    task.status === 'succeeded' ||
    task.status === 'failed' ||
    task.status === 'canceled'
  ) {
    return {
      ok: false,
      id: task.id,
      status: 'already_done',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  const pausedAt = nowIso()
  const prevStatus = task.status
  runtime.lastWorkerActivityAtMs = Date.now()
  clearTaskLiveOutput(runtime, task.id)
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
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.reason ? { reason: meta.reason } : {}),
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
