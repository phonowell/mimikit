import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { markTaskCanceled } from '../orchestrator/core/task-lifecycle.js'
import { parseIsoMs } from '../shared/time.js'
import { nowIso } from '../shared/utils.js'

import { buildResult, finalizeResult } from './result-finalize.js'
import {
  discardTaskSession,
  isRecoverableCancelSource,
  setTaskSessionReusable,
} from './session-state.js'
import {
  isDoneTaskStatus,
  resolveTaskLookupTarget,
  touchTaskMutation,
} from './task-action.js'
import { resolveTaskChangeAt } from './task-state-shared.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TaskCancelMeta, TaskResult } from '../types/index.js'

export type CancelMeta = {
  source?: string
  reason?: string
}

export type CancelResult = {
  ok: boolean
  id: string
  status:
    | 'canceled'
    | 'not_found'
    | 'already_done'
    | 'already_canceled'
    | 'invalid'
  changeAt?: string
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

const applyCancelSessionPolicy = (
  task: Task,
  cancelSource: TaskCancelMeta['source'],
): 'reusable' | 'discarded' | 'none' => {
  if (cancelSource === 'user') {
    if (discardTaskSession(task)) return 'discarded'
    return 'none'
  }
  if (!isRecoverableCancelSource(cancelSource)) return 'none'
  if (!task.sessionId) return 'none'
  setTaskSessionReusable(task, task.sessionId)
  return 'reusable'
}

export const cancelTask = async (
  runtime: RuntimeState,
  taskId: string,
  meta?: CancelMeta,
): Promise<CancelResult> => {
  const lookup = resolveTaskLookupTarget(runtime, taskId)
  if ('status' in lookup)
    return { ok: false, id: lookup.id, status: lookup.status }
  const { task } = lookup
  if (task.status === 'canceled') {
    return {
      ok: false,
      id: task.id,
      status: 'already_canceled',
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

  if (task.status === 'pending' || task.status === 'paused') {
    touchTaskMutation(runtime, task.id)
    const cancelMeta = buildCancelMeta(meta)
    const sessionPolicy = applyCancelSessionPolicy(task, cancelMeta.source)
    task.cancel = cancelMeta
    const startedAtMs = parseIsoMs(task.startedAt ?? '')
    const durationMs =
      startedAtMs !== undefined ? Math.max(0, Date.now() - startedAtMs) : 0
    const result: TaskResult = buildResult(
      task,
      'canceled',
      meta?.reason ?? 'Task canceled',
      durationMs,
    )
    result.cancel = cancelMeta
    markTaskCanceled(runtime.tasks, task.id, {
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      cancel: cancelMeta,
    })
    await finalizeResult(runtime, task, result, markTaskCanceled, {
      progressType: 'task_canceled',
      logEvent: 'task_canceled',
      archiveSource: 'cancel',
    })
    await bestEffort('persistRuntimeState: cancel_pending', () =>
      persistRuntimeState(runtime),
    )
    await bestEffort('appendLog: task_cancel_session_policy', () =>
      appendLog(runtime.paths.log, {
        event: 'task_cancel_session_policy',
        taskId: task.id,
        source: cancelMeta.source,
        policy: sessionPolicy,
      }),
    )
    notifyWorkerLoop(runtime)
    return {
      ok: true,
      id: task.id,
      status: 'canceled',
      changeAt: result.completedAt,
    }
  }

  const canceledAt = nowIso()
  touchTaskMutation(runtime, task.id)
  const canceledAtMs = parseIsoMs(canceledAt)
  const startedAtMs = parseIsoMs(task.startedAt ?? '')
  const durationMs =
    startedAtMs !== undefined && canceledAtMs !== undefined
      ? Math.max(0, canceledAtMs - startedAtMs)
      : undefined
  const cancelMeta = buildCancelMeta(meta)
  const sessionPolicy = applyCancelSessionPolicy(task, cancelMeta.source)
  markTaskCanceled(runtime.tasks, task.id, {
    completedAt: canceledAt,
    ...(durationMs !== undefined ? { durationMs } : {}),
    cancel: cancelMeta,
  })
  const controller = runtime.worker.runningControllers.get(task.id)
  if (controller && !controller.signal.aborted) controller.abort()
  await bestEffort('appendLog: task_cancel_requested', () =>
    appendLog(runtime.paths.log, {
      event: 'task_cancel_requested',
      taskId: task.id,
      source: cancelMeta.source,
      sessionPolicy,
      ...(cancelMeta.reason ? { reason: cancelMeta.reason } : {}),
    }),
  )
  await bestEffort('persistRuntimeState: cancel_running', () =>
    persistRuntimeState(runtime),
  )
  notifyWorkerLoop(runtime)
  return {
    ok: true,
    id: task.id,
    status: 'canceled',
    changeAt: canceledAt,
  }
}
