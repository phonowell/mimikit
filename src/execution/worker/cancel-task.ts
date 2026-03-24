import { nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import {
  notifyUiSignal,
  notifyWorkerLoop,
} from '../../kernel/orchestrator/signals.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  applyTaskCancelSessionPolicy,
  buildTaskCancelMeta,
  resolveTaskElapsedDurationMs,
} from '../../work/orchestrator/task-cancel-write.js'
import { clearTaskResumeChoice } from '../../work/orchestrator/task-resume-choice.js'
import {
  cancelRuntimeTask,
  patchRuntimeTask,
} from '../../work/orchestrator/task-state-write.js'

import { buildResult } from './result-build.js'
import { finalizeResult } from './result-finalize.js'
import {
  isDoneTaskStatus,
  resolveTaskLookupTarget,
  touchTaskMutation,
} from './task-action.js'
import { resolveTaskChangeAt } from './task-state-shared.js'

import type { TaskResult } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

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

export const cancelTask = async (
  runtime: WorkerRuntime,
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
    clearTaskResumeChoice(runtime, task.id)
    const cancelMeta = buildTaskCancelMeta(meta)
    const sessionPolicy = applyTaskCancelSessionPolicy({
      runtime,
      taskId: task.id,
      task,
      cancelSource: cancelMeta.source,
    })
    const durationMs = resolveTaskElapsedDurationMs({ task }) ?? 0
    const result: TaskResult = buildResult(
      task,
      'canceled',
      meta?.reason ?? 'Task canceled',
      durationMs,
    )
    result.cancel = cancelMeta
    cancelRuntimeTask({
      runtime,
      taskId: task.id,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      cancel: cancelMeta,
    })
    await finalizeResult(
      runtime,
      task,
      result,
      (_tasks, canceledTaskId, patch) => {
        if (!patch) return
        patchRuntimeTask({
          runtime,
          taskId: canceledTaskId,
          patch,
        })
      },
      {
        progressType: 'task_canceled',
        logEvent: 'task_canceled',
        archiveSource: 'cancel',
        taskPatch: {
          cancel: cancelMeta,
        },
      },
    )
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
    notifyUiSignal(runtime)
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
  clearTaskResumeChoice(runtime, task.id)
  const durationMs = resolveTaskElapsedDurationMs({
    task,
    completedAt: canceledAt,
  })
  const cancelMeta = buildTaskCancelMeta(meta)
  const sessionPolicy = applyTaskCancelSessionPolicy({
    runtime,
    taskId: task.id,
    task,
    cancelSource: cancelMeta.source,
  })
  cancelRuntimeTask({
    runtime,
    taskId: task.id,
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
  notifyUiSignal(runtime)
  notifyWorkerLoop(runtime)
  return {
    ok: true,
    id: task.id,
    status: 'canceled',
    changeAt: canceledAt,
  }
}
