import { syncFocusContextFromTaskResult } from '../focus/result-feedback.js'
import { appendLog } from '../log/append.js'
import { bestEffort, safeOrUndefined } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/signals.js'
import { nowIso } from '../shared/utils.js'
import { appendTaskProgress } from '../storage/task-progress.js'
import {
  resolveTaskResultArchivePath,
  writeTaskResultArchiveAtPath,
} from '../storage/task-results.js'
import { publishWorkerResult } from '../streams/queues.js'

import {
  buildTaskEvidence,
  hasTaskEvidenceMismatch,
} from './result-evidence.js'
import {
  buildTaskResultHandoff,
  withTaskArchiveEvidence,
} from './result-handoff.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TaskResult, TokenUsage } from '../types/index.js'

export const archiveTaskResult = (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  source: 'worker' | 'cancel',
): Promise<string | undefined> =>
  safeOrUndefined(`appendTaskResultArchive: ${source}`, async () => {
    const archiveEntry = {
      taskId: task.id,
      focusId: task.focusId,
      title: task.title,
      status: result.status,
      provider: task.provider,
      prompt: task.prompt,
      output: result.output,
      createdAt: task.createdAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.cancel ? { cancel: result.cancel } : {}),
      ...(result.handoff ? { handoff: result.handoff } : {}),
      ...(result.evidence ? { evidence: result.evidence } : {}),
    }
    const archivePath = await resolveTaskResultArchivePath(
      runtime.config.workDir,
      archiveEntry,
    )
    const nextHandoff = withTaskArchiveEvidence(result.handoff, archivePath)
    await writeTaskResultArchiveAtPath(archivePath, {
      ...archiveEntry,
      ...(nextHandoff ? { handoff: nextHandoff } : {}),
    })
    result.archivePath = archivePath
    result.handoff = nextHandoff
    return archivePath
  })

export const buildResult = (
  task: Task,
  status: TaskResult['status'],
  output: string,
  durationMs: number,
  usage?: TokenUsage,
): TaskResult => {
  const handoff = buildTaskResultHandoff(task, { status, output })
  return {
    taskId: task.id,
    status,
    ok: status === 'succeeded',
    output,
    durationMs,
    completedAt: nowIso(),
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
  },
): Promise<void> => {
  const progressType = options?.progressType ?? 'worker_end'
  const logEvent = options?.logEvent ?? 'worker_end'
  const archiveSource = options?.archiveSource ?? 'worker'
  runtime.lastWorkerActivityAtMs = Date.now()
  result.handoff ??= buildTaskResultHandoff(task, result)
  const previousStatus = task.status
  const archivePath = await archiveTaskResult(
    runtime,
    task,
    result,
    archiveSource,
  )
  result.evidence = buildTaskEvidence({
    task,
    result,
    previousStatus,
    ...(archivePath ? { archivePath } : {}),
  })
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
  markFn(runtime.tasks, task.id, {
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(archivePath ? { archivePath } : {}),
  })
  syncFocusContextFromTaskResult(runtime, task, result)
  await bestEffort(`appendTaskProgress: ${progressType}`, () =>
    appendTaskProgress({
      stateDir: runtime.config.workDir,
      taskId: task.id,
      type: progressType,
      payload: {
        status: result.status,
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
      durationMs: result.durationMs,
      elapsedMs: result.durationMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.cancel ? { cancelSource: result.cancel.source } : {}),
      ...(archivePath ? { archivePath } : {}),
    }),
  )
}
