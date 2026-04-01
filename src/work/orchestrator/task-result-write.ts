import { notifyManagerLoop } from '../../kernel/orchestrator/signals.js'
import { publishWorkerResult } from '../../kernel/streams/queues.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { appendTaskProgress } from '../../persistence/storage/task-progress.js'
import { appendWorkerUsageLedgerEntry } from '../../persistence/storage/usage-ledger.js'
import { resolveTaskGitLifecycle } from '../shared/task-git-lifecycle.js'

import { applyRuntimeTaskResultDomainWrite } from './task-state-write.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'
import type {
  RuntimeManagerState,
  RuntimePathsState,
  RuntimePersistState,
  RuntimeUiState,
  RuntimeWorkerState,
} from '../../kernel/orchestrator/runtime-interfaces.js'

export type ApplyTaskResultWriteOptions = {
  markTask: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void
  progressType?: 'worker_end' | 'task_canceled'
  logEvent?: 'worker_end' | 'task_canceled'
  taskPatch?: Partial<Task>
  persistCompletionFields?: boolean
}

type TaskResultWriteRuntime = RuntimePersistState & {
  paths: RuntimePathsState['paths']
  manager: RuntimePersistState['manager'] &
    Pick<RuntimeManagerState, 'wakePending' | 'signalController'>
  worker: Pick<RuntimeWorkerState, 'lastActivityAtMs'>
  ui: RuntimePersistState['ui'] &
    Pick<RuntimeUiState, 'wakeVersion' | 'wakeEvents' | 'signalControllers'>
}

export const applyTaskResultWrite = async (params: {
  runtime: TaskResultWriteRuntime
  task: Task
  result: TaskResult
  options: ApplyTaskResultWriteOptions
}): Promise<void> => {
  const { runtime, task, result, options } = params
  const progressType = options.progressType ?? 'worker_end'
  const logEvent = options.logEvent ?? 'worker_end'
  const rawArchivePath = result.archivePath?.trim()
  const archivePath =
    rawArchivePath && rawArchivePath.length > 0 ? rawArchivePath : undefined
  const gitLifecycle = task.git ? resolveTaskGitLifecycle(task) : undefined
  const nextGit =
    task.git &&
    ({
      ...task.git,
      ...(gitLifecycle ? { lifecycle: gitLifecycle } : {}),
    } satisfies NonNullable<Task['git']>)
  const basePatch: Partial<Task> = {
    ...(options.persistCompletionFields === false
      ? {}
      : {
          completedAt: result.completedAt,
          durationMs: result.durationMs,
        }),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(archivePath ? { archivePath } : {}),
    ...(nextGit ? { git: nextGit } : {}),
    ...(options.taskPatch ?? {}),
  }

  runtime.worker.lastActivityAtMs = Date.now()
  applyRuntimeTaskResultDomainWrite({
    runtime,
    taskId: task.id,
    result,
    markTask: options.markTask,
    patch: basePatch,
  })

  await bestEffort(`appendTaskProgress: ${progressType}`, () =>
    appendTaskProgress({
      stateDir: runtime.config.workDir,
      taskId: task.id,
      type: progressType,
      payload: {
        status: result.status,
        taskStatus: result.taskStatus,
        outcome: result.outcome,
        stopReason: result.stopReason,
        durationMs: result.durationMs,
        ...(result.cancel ? { cancel: result.cancel } : {}),
        ...(archivePath ? { archivePath } : {}),
      },
    }),
  )
  await publishWorkerResult({
    paths: runtime.paths,
    payload: result,
  })
  notifyManagerLoop(runtime)
  await bestEffort(`appendLog: ${logEvent}`, () =>
    appendLog(runtime.paths.log, {
      event: logEvent,
      taskId: task.id,
      status: result.status,
      taskStatus: result.taskStatus,
      outcome: result.outcome,
      stopReason: result.stopReason,
      durationMs: result.durationMs,
      elapsedMs: result.durationMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.status === 'canceled'
        ? { usageCaptured: Boolean(result.usage) }
        : {}),
      ...(result.cancel ? { cancelSource: result.cancel.source } : {}),
      ...(archivePath ? { archivePath } : {}),
    }),
  )
  await bestEffort('appendWorkerUsageLedgerEntry', () =>
    appendWorkerUsageLedgerEntry({
      stateDir: runtime.config.workDir,
      focusId: task.focusId,
      taskId: task.id,
      provider: task.provider,
      ...(result.usage ? { usage: result.usage } : {}),
      elapsedMs: result.durationMs,
      ...(task.sessionId ? { threadId: task.sessionId } : {}),
      model: runtime.config.codex.model,
      status: result.status,
      ...(result.providerCallId
        ? { providerCallId: result.providerCallId }
        : {}),
      ...(result.traceRef ? { traceRef: result.traceRef } : {}),
      ...(typeof result.attempt === 'number'
        ? { attempt: result.attempt }
        : {}),
    }),
  )
}
