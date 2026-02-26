import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { notifyManagerLoop, notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { markTaskCanceled } from '../orchestrator/core/task-lifecycle.js'
import { nowIso } from '../shared/utils.js'
import { publishWorkerResult } from '../streams/queues.js'

import { archiveTaskResult } from './result-finalize.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TaskCancelMeta, TaskResult } from '../types/index.js'

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
    ...(task.cancel ? { cancel: task.cancel } : {}),
  }
}

const normalizeCancelSource = (source?: string): TaskCancelMeta['source'] => {
  if (source === 'user' || source === 'http') return 'user'
  if (source === 'deferred') return 'deferred'
  return 'system'
}

const buildCancelMeta = (meta?: CancelMeta): TaskCancelMeta => ({
  source: normalizeCancelSource(meta?.source),
  ...(meta?.reason ? { reason: meta.reason } : {}),
})

const pushCanceledResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
) => {
  const archivePath = await archiveTaskResult(runtime, task, result, 'cancel')
  if (archivePath) result.archivePath = task.archivePath = archivePath
  await publishWorkerResult({
    paths: runtime.paths,
    payload: result,
  })
  notifyManagerLoop(runtime)
  await bestEffort('appendLog: task_canceled', () =>
    appendLog(runtime.paths.log, {
      event: 'task_canceled',
      taskId: task.id,
      status: result.status,
      durationMs: result.durationMs,
      ...(result.cancel ? { cancelSource: result.cancel.source } : {}),
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
    runtime.lastWorkerActivityAtMs = Date.now()
    const cancelMeta = buildCancelMeta(meta)
    const result = buildCanceledResult(task, meta?.reason ?? 'Task canceled')
    markTaskCanceled(runtime.tasks, task.id, {
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      cancel: cancelMeta,
    })
    result.cancel = cancelMeta
    await pushCanceledResult(runtime, task, result)
    await bestEffort('persistRuntimeState: cancel_pending', () =>
      persistRuntimeState(runtime),
    )
    notifyWorkerLoop(runtime)
    return { ok: true, status: 'canceled', taskId: task.id }
  }

  const canceledAt = nowIso()
  runtime.lastWorkerActivityAtMs = Date.now()
  const canceledAtMs = Date.parse(canceledAt)
  const startedAtMs = task.startedAt ? Date.parse(task.startedAt) : NaN
  const durationMs =
    Number.isFinite(startedAtMs) && Number.isFinite(canceledAtMs)
      ? Math.max(0, canceledAtMs - startedAtMs)
      : undefined
  const cancelMeta = buildCancelMeta(meta)
  markTaskCanceled(runtime.tasks, task.id, {
    completedAt: canceledAt,
    ...(durationMs !== undefined ? { durationMs } : {}),
    cancel: cancelMeta,
  })
  const controller = runtime.runningControllers.get(task.id)
  if (controller && !controller.signal.aborted) controller.abort()
  await bestEffort('appendLog: task_cancel_requested', () =>
    appendLog(runtime.paths.log, {
      event: 'task_cancel_requested',
      taskId: task.id,
      source: cancelMeta.source,
      ...(cancelMeta.reason ? { reason: cancelMeta.reason } : {}),
    }),
  )
  await bestEffort('persistRuntimeState: cancel_running', () =>
    persistRuntimeState(runtime),
  )
  notifyWorkerLoop(runtime)
  return { ok: true, status: 'canceled', taskId: task.id }
}
