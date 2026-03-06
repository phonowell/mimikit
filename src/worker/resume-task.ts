import { appendTaskSystemMessage } from '../history/task-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { nowIso } from '../shared/utils.js'

import { enqueueWorkerTask } from './dispatch.js'
import { clearTaskLiveOutput } from './live-output.js'

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

export const resumeTask = async (
  runtime: RuntimeState,
  taskId: string,
  meta?: ResumeMeta,
): Promise<ResumeResult> => {
  const trimmed = taskId.trim()
  if (!trimmed) return { ok: false, id: trimmed, status: 'invalid' }
  const task = runtime.tasks.find((item) => item.id === trimmed)
  if (!task) return { ok: false, id: trimmed, status: 'not_found' }
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
  if (task.status !== 'paused') {
    return {
      ok: false,
      id: task.id,
      status: 'not_paused',
      changeAt: resolveTaskChangeAt(task),
    }
  }

  const resumedAt = nowIso()
  runtime.lastWorkerActivityAtMs = Date.now()
  task.status = 'pending'
  delete task.pausedAt
  delete task.startedAt
  delete task.completedAt
  delete task.durationMs
  clearTaskLiveOutput(runtime, task.id)

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
