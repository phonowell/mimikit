import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { markTaskPaused } from '../../work/orchestrator/task-lifecycle.js'
import { applyTaskResultWrite } from '../../work/orchestrator/task-result-write.js'
import { resolveTaskGitLifecycle } from '../../work/shared/task-git-lifecycle.js'
import { readTaskExecutionSpec } from '../../work/spec/store.js'

import { resolveArchivePath, writeTaskArchive } from './result-archive.js'
import {
  applyClosureFollowupHandoff,
  enqueueClosureTaskIfNeeded,
} from './result-closure.js'
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
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const finalizeResult = async (
  runtime: WorkerRuntime,
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
  result.handoff ??= buildTaskResultHandoff(task, result)
  const gitLifecycle = task.git ? resolveTaskGitLifecycle(task) : undefined
  if (task.git && result.handoff?.git && gitLifecycle) {
    result.handoff.git = {
      ...result.handoff.git,
      lifecycle: gitLifecycle,
    }
  }
  const previousStatus = task.status
  const spec = await readTaskExecutionSpec(
    runtime.config.workDir,
    task.executionSpecId,
  )
  applyClosureFollowupHandoff({ task, result })
  applyTaskResultStateDefaults(result)
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
    ...(spec.contract ? { contract: spec.contract } : {}),
  })
  const archivePath = candidateArchivePath
    ? await writeTaskArchive(
        runtime.config.workDir,
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
      ...(spec.contract ? { contract: spec.contract } : {}),
    })
  }
  if (
    hasTaskEvidenceMismatch({
      task,
      result,
      ...(spec.contract ? { contract: spec.contract } : {}),
    })
  ) {
    await bestEffort('appendLog: task_evidence_mismatch', () =>
      appendLog(runtime.paths.log, {
        event: 'task_evidence_mismatch',
        taskId: task.id,
        hasContract: true,
        status: result.status,
      }),
    )
  }
  await applyTaskResultWrite({
    runtime,
    task,
    result,
    options: {
      markTask: result.taskStatus === 'paused' ? markTaskPaused : markFn,
      progressType,
      logEvent,
      ...(options?.taskPatch ? { taskPatch: options.taskPatch } : {}),
      ...(options?.persistCompletionFields !== undefined
        ? { persistCompletionFields: options.persistCompletionFields }
        : {}),
    },
  })
  await enqueueClosureTaskIfNeeded({ runtime, task, result })
}
