import { appendLog } from '../log/append.js'
import { safe } from '../log/safe.js'
import { nowIso } from '../shared/utils.js'
import { appendTaskResultArchive } from '../storage/task-results.js'
import { markTaskCanceled } from '../tasks/queue.js'

import type { RuntimeState } from './runtime.js'
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
  }
}

const archiveCanceledResult = (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
): Promise<string | undefined> =>
  safe(
    'appendTaskResultArchive: cancel',
    () =>
      appendTaskResultArchive(runtime.config.stateDir, {
        taskId: task.id,
        title: task.title,
        status: result.status,
        prompt: task.prompt,
        output: result.output,
        createdAt: task.createdAt,
        completedAt: result.completedAt,
        durationMs: result.durationMs,
        ...(result.usage ? { usage: result.usage } : {}),
      }),
    { fallback: undefined },
  )

const pushCanceledResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
) => {
  const archivePath = await archiveCanceledResult(runtime, task, result)
  if (archivePath) result.archivePath = archivePath
  runtime.pendingResults.push(result)
  await safe(
    'appendLog: task_canceled',
    () =>
      appendLog(runtime.paths.log, {
        event: 'task_canceled',
        taskId: task.id,
        status: result.status,
        durationMs: result.durationMs,
        ...(archivePath ? { archivePath } : {}),
      }),
    { fallback: undefined },
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
    return { ok: true, status: 'canceled', taskId: task.id }
  }

  markTaskCanceled(runtime.tasks, task.id)
  const controller = runtime.runningControllers.get(task.id)
  if (controller && !controller.signal.aborted) controller.abort()
  await safe(
    'appendLog: task_cancel_requested',
    () =>
      appendLog(runtime.paths.log, {
        event: 'task_cancel_requested',
        taskId: task.id,
        ...(meta?.source ? { source: meta.source } : {}),
        ...(meta?.reason ? { reason: meta.reason } : {}),
      }),
    { fallback: undefined },
  )
  return { ok: true, status: 'canceled', taskId: task.id }
}
