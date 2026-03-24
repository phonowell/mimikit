import { notifyManagerLoop } from '../../kernel/orchestrator/signals.js'
import { publishWorkerResult } from '../../kernel/streams/queues.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { appendTaskProgress } from '../../persistence/storage/task-progress.js'
import { appendWorkerUsageLedgerEntry } from '../../persistence/storage/usage-ledger.js'
import { syncFocusFromTaskResult } from '../../work/focus/result-feedback.js'
import {
  mergeTaskGitLifecycle,
  resolveTaskGitLifecycle,
} from '../../work/shared/task-git-lifecycle.js'

import { stripWorkerProtocolTags } from './profiled-runner-prompt.js'
import { resolveArchivePath, writeTaskArchive } from './result-archive.js'
import {
  buildTaskEvidence,
  hasTaskEvidenceMismatch,
} from './result-evidence.js'
import {
  buildTaskResultHandoff,
  withTaskArchiveEvidence,
} from './result-handoff.js'
import { applyTaskResultStateDefaults } from './result-state.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

export const finalizeResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  markFn: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void,
  options?: {
    progressType?: 'worker_end' | 'task_canceled'
    logEvent?: 'worker_end' | 'task_canceled'
    archiveSource?: 'worker' | 'cancel'
    taskPatch?: Partial<Task>
    persistCompletionFields?: boolean
  },
): Promise<void> => {
  const progressType = options?.progressType ?? 'worker_end'
  const logEvent = options?.logEvent ?? 'worker_end'
  const archiveSource = options?.archiveSource ?? 'worker'
  runtime.worker.lastActivityAtMs = Date.now()
  if (task.git) {
    const lifecycle = mergeTaskGitLifecycle({
      current: resolveTaskGitLifecycle(task),
      patch: result.handoff?.git?.lifecycle,
    })
    if (lifecycle) task.git = { ...task.git, lifecycle }
  }
  result.handoff ??= buildTaskResultHandoff(task, result)
  result.output = stripWorkerProtocolTags(result.output)
  applyTaskResultStateDefaults(result)
  const previousStatus = task.status
  const candidateArchivePath = await resolveArchivePath(
    runtime,
    task,
    result,
    archiveSource,
  )
  const archivedHandoff = candidateArchivePath
    ? withTaskArchiveEvidence(result.handoff, candidateArchivePath)
    : result.handoff
  const archiveEvidence = buildTaskEvidence({
    task,
    result: {
      ...result,
      ...(archivedHandoff ? { handoff: archivedHandoff } : {}),
    },
    previousStatus,
    ...(candidateArchivePath ? { archivePath: candidateArchivePath } : {}),
  })
  const archivePath = candidateArchivePath
    ? await writeTaskArchive(
        task,
        {
          ...result,
          ...(archivedHandoff ? { handoff: archivedHandoff } : {}),
          ...(archiveEvidence ? { evidence: archiveEvidence } : {}),
        },
        candidateArchivePath,
        archiveSource,
      )
    : undefined
  if (archivePath) {
    result.archivePath = archivePath
    result.handoff = archivedHandoff
    result.evidence = archiveEvidence
  } else {
    result.evidence = buildTaskEvidence({
      task,
      result,
      previousStatus,
    })
  }
  if (hasTaskEvidenceMismatch({ task, result })) {
    await bestEffort('appendLog: task_evidence_mismatch', () =>
      appendLog(runtime.paths.log, {
        event: 'task_evidence_mismatch',
        taskId: task.id,
        hasContract: Boolean(task.contract),
        status: result.status,
      }),
    )
  }
  if (archivePath) task.archivePath = archivePath
  const basePatch: Partial<Task> = {
    ...(options?.persistCompletionFields === false
      ? {}
      : {
          completedAt: result.completedAt,
          durationMs: result.durationMs,
        }),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(archivePath ? { archivePath } : {}),
    ...(options?.taskPatch ?? {}),
  }
  markFn(runtime.tasks, task.id, basePatch)
  syncFocusFromTaskResult(runtime, task, result)
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
    }),
  )
}
