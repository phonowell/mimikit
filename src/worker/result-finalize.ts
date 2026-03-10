import { syncFocusContextFromTaskResult } from '../focus/result-feedback.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/signals.js'
import { nowIso } from '../shared/utils.js'
import { appendTaskProgress } from '../storage/task-progress.js'
import { publishWorkerResult } from '../streams/queues.js'

import { resolveArchivePath, writeTaskArchive } from './result-archive.js'
import {
  buildTaskEvidence,
  hasTaskEvidenceMismatch,
} from './result-evidence.js'
import {
  buildTaskResultHandoff,
  withTaskArchiveEvidence,
} from './result-handoff.js'
import {
  applyTaskResultStateDefaults,
  buildDefaultTaskResultState,
} from './result-state.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TaskResult, TokenUsage } from '../types/index.js'

export const buildResult = (
  task: Task,
  status: TaskResult['status'],
  output: string,
  durationMs: number,
  usage?: TokenUsage,
): TaskResult => {
  const handoff = buildTaskResultHandoff(task, { status, output })
  const state = buildDefaultTaskResultState(status)
  return {
    taskId: task.id,
    status,
    ok: status === 'succeeded',
    output,
    durationMs,
    completedAt: nowIso(),
    ...state,
    ...(usage ? { usage } : {}),
    ...(task.title ? { title: task.title } : {}),
    profile: task.profile,
    provider: task.provider,
    ...(status === 'canceled'
      ? { cancel: task.cancel ?? { source: 'system' } }
      : {}),
    ...(handoff ? { handoff } : {}),
  }
}

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
  result.handoff ??= buildTaskResultHandoff(task, result)
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
  syncFocusContextFromTaskResult(runtime, task, result)
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
}
