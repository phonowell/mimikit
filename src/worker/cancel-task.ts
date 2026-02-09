import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import { nowIso } from '../shared/utils.js'
import { publishWorkerResult } from '../streams/channels.js'
import { markTaskCanceled } from '../tasks/queue.js'

import { archiveTaskResult } from './runtime-utils.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TaskResult } from '../types/index.js'

export type CancelMeta = {
  source?: string
  reason?: string
}

export type CancelResult = {
  ok: boolean
  status:
    | 'canceled'
    | 'not_found'
    | 'already_done'
    | 'already_canceled'
    | 'invalid'
  taskId?: string
}

const buildCanceledResult = (task: Task, output: string): TaskResult => {
  const completedAt = nowIso()
  const startedAtMs = task.startedAt ? Date.parse(task.startedAt) : NaN
  const durationMs = Number.isFinite(startedAtMs)
    ? Math.max(0, Date.now() - startedAtMs)
    : 0
  return {
    taskId: task.id,
    status: 'canceled',
    ok: false,
    output,
    durationMs,
    completedAt,
    ...(task.title ? { title: task.title } : {}),
    profile: task.profile,
  }
}

const pushCanceledResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
) => {
  const archivePath = await archiveTaskResult(runtime, task, result, 'cancel')
  if (archivePath) result.archivePath = archivePath
  if (archivePath) task.archivePath = archivePath
  await publishWorkerResult({
    paths: runtime.paths,
    payload: result,
  })
  await bestEffort('appendLog: task_canceled', () =>
    appendLog(runtime.paths.log, {
      event: 'task_canceled',
      taskId: task.id,
      status: result.status,
      durationMs: result.durationMs,
      ...(archivePath ? { archivePath } : {}),
    }),
  )
}

export const cancelTask = async (
  runtime: RuntimeState,
  taskId: string,
  meta?: CancelMeta,
): Promise<CancelResult> => {
  const trimmed = taskId.trim()
  if (!trimmed) return { ok: false, status: 'invalid' }
  const task = runtime.tasks.find((item) => item.id === trimmed)
  if (!task) return { ok: false, status: 'not_found', taskId: trimmed }
  if (task.status === 'canceled')
    return { ok: false, status: 'already_canceled', taskId: trimmed }
  if (task.status === 'succeeded' || task.status === 'failed')
    return { ok: false, status: 'already_done', taskId: trimmed }

  if (task.status === 'pending') {
    const result = buildCanceledResult(task, meta?.reason ?? 'Task canceled')
    markTaskCanceled(runtime.tasks, task.id, {
      completedAt: result.completedAt,
      durationMs: result.durationMs,
    })
    await pushCanceledResult(runtime, task, result)
    await bestEffort('persistRuntimeState: cancel_pending', () =>
      persistRuntimeState(runtime),
    )
    notifyWorkerLoop(runtime)
    return { ok: true, status: 'canceled', taskId: task.id }
  }

  const canceledAt = nowIso()
  const canceledAtMs = Date.parse(canceledAt)
  const startedAtMs = task.startedAt ? Date.parse(task.startedAt) : NaN
  const durationMs =
    Number.isFinite(startedAtMs) && Number.isFinite(canceledAtMs)
      ? Math.max(0, canceledAtMs - startedAtMs)
      : undefined
  markTaskCanceled(runtime.tasks, task.id, {
    completedAt: canceledAt,
    ...(durationMs !== undefined ? { durationMs } : {}),
  })
  const controller = runtime.runningControllers.get(task.id)
  if (controller && !controller.signal.aborted) controller.abort()
  await bestEffort('appendLog: task_cancel_requested', () =>
    appendLog(runtime.paths.log, {
      event: 'task_cancel_requested',
      taskId: task.id,
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.reason ? { reason: meta.reason } : {}),
    }),
  )
  await bestEffort('persistRuntimeState: cancel_running', () =>
    persistRuntimeState(runtime),
  )
  notifyWorkerLoop(runtime)
  return { ok: true, status: 'canceled', taskId: task.id }
}
