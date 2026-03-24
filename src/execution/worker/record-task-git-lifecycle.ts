import { nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { applyRuntimeTaskGitResult } from '../../work/orchestrator/task-state-write.js'
import {
  mergeTaskGitLifecycle,
  resolveTaskGitLifecycle,
  type TaskGitLifecyclePatch,
} from '../../work/shared/task-git-lifecycle.js'

import {
  buildTaskMutationMetaFields,
  isDoneTaskStatus,
  resolveTaskLookupTarget,
  touchTaskMutation,
} from './task-action.js'
import {
  buildTaskResultWithGitLifecycle,
  syncTaskGitLifecycleArtifacts,
} from './task-git-lifecycle-artifacts.js'
import { resolveTaskChangeAt } from './task-state-shared.js'

import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type TaskGitLifecycleOp = 'review_passed' | 'merged' | 'cleaned'

export type RecordTaskGitLifecycleMeta = {
  source?: string
  reason?: string
  sha?: string
}

export type RecordTaskGitLifecycleResult = {
  ok: boolean
  id: string
  status:
    | TaskGitLifecycleOp
    | 'invalid'
    | 'not_found'
    | 'not_done'
    | 'not_git'
    | 'review_required'
    | 'merge_required'
  changeAt?: string
}

const buildLifecyclePatch = (
  op: TaskGitLifecycleOp,
  changedAt: string,
  meta?: RecordTaskGitLifecycleMeta,
): TaskGitLifecyclePatch => {
  if (op === 'review_passed') {
    return {
      review: {
        passed: true,
        at: changedAt,
        ...(meta?.sha ? { sha: meta.sha } : {}),
      },
    }
  }
  if (op === 'merged') return { merged: true, mergedAt: changedAt }
  return { cleaned: true, cleanedAt: changedAt }
}

export const recordTaskGitLifecycle = async (
  runtime: WorkerRuntime,
  taskId: string,
  op: TaskGitLifecycleOp,
  meta?: RecordTaskGitLifecycleMeta,
): Promise<RecordTaskGitLifecycleResult> => {
  const lookup = resolveTaskLookupTarget(runtime, taskId)
  if ('status' in lookup)
    return { ok: false, id: lookup.id, status: lookup.status }
  const { task } = lookup
  if (!isDoneTaskStatus(task.status)) {
    return {
      ok: false,
      id: task.id,
      status: 'not_done',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  if (!task.git) {
    return {
      ok: false,
      id: task.id,
      status: 'not_git',
      changeAt: resolveTaskChangeAt(task),
    }
  }

  const currentLifecycle = resolveTaskGitLifecycle(task)
  if (op === 'merged' && !currentLifecycle?.review.passed) {
    return {
      ok: false,
      id: task.id,
      status: 'review_required',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  if (op === 'cleaned' && !currentLifecycle?.merged) {
    return {
      ok: false,
      id: task.id,
      status: 'merge_required',
      changeAt: resolveTaskChangeAt(task),
    }
  }

  const changedAt = nowIso()
  const lifecycle = mergeTaskGitLifecycle({
    current: currentLifecycle,
    patch: buildLifecyclePatch(op, changedAt, meta),
  })
  if (!lifecycle) {
    return {
      ok: false,
      id: task.id,
      status: 'not_git',
      changeAt: resolveTaskChangeAt(task),
    }
  }
  const git = { ...task.git, lifecycle }
  const result = buildTaskResultWithGitLifecycle(task, git)
  await syncTaskGitLifecycleArtifacts({
    task,
    git,
    ...(result ? { result } : {}),
  })

  touchTaskMutation(runtime, task.id)
  applyRuntimeTaskGitResult({
    runtime,
    taskId: task.id,
    git,
    ...(result ? { result } : {}),
  })
  await bestEffort('appendLog: task_git_lifecycle_recorded', () =>
    appendLog(runtime.paths.log, {
      event: 'task_git_lifecycle_recorded',
      taskId: task.id,
      op,
      lifecycle,
      ...buildTaskMutationMetaFields(meta),
    }),
  )
  await bestEffort('persistRuntimeState: task_git_lifecycle_recorded', () =>
    persistRuntimeState(runtime),
  )
  notifyUiSignal(runtime, 'tasks')
  return {
    ok: true,
    id: task.id,
    status: op,
    changeAt: changedAt,
  }
}
