import { readHistory } from '../../persistence/history/store.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
} from '../../persistence/storage/runtime-snapshot.js'
import {
  readTaskResultArchive,
  writeTaskResultArchiveAtPath,
} from '../../persistence/storage/task-results.js'
import { toPersistedMemoryRefreshState } from '../../policy/memory/refresh/state.js'
import { applyClosureTaskGitTruth } from '../../work/shared/task-git-closure-truth.js'
import { readTaskExecutionSpec } from '../../work/spec/store.js'

import { reconcileRuntimeQueueState } from './runtime-queue-reconcile.js'
import {
  applyRuntimeSnapshotHydrateSlice,
  buildRuntimeSnapshotHydrateSlice,
  type RuntimeSnapshotHydrateTarget,
} from './runtime-snapshot-hydrate.js'
import {
  buildRuntimeSnapshot,
  normalizeChannelTargets,
  type RuntimeSnapshotPersistSlice,
} from './runtime-snapshot-persist.js'

import type {
  RuntimeChannelTargets,
  RuntimePathsState,
} from './runtime-interfaces.js'
import type { Task } from '../../foundation/types/index.js'

const restoreChannelTargetsFromHistory = async (
  historyPath: string,
  currentTargets: RuntimeChannelTargets = {},
): Promise<RuntimeChannelTargets> => {
  const history = await readHistory(historyPath)
  let { telegramChatId } = currentTargets
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (!item) break
    if (
      'telegramChatId' in item &&
      typeof item.telegramChatId === 'string' &&
      !telegramChatId
    )
      telegramChatId = item.telegramChatId.trim()
    if (telegramChatId) break
  }
  return normalizeChannelTargets({
    ...(telegramChatId ? { telegramChatId } : {}),
  })
}

type HydratableRuntimeState = RuntimeSnapshotHydrateTarget &
  RuntimePathsState & {
    config: { workDir: string }
  }

const resolveTaskArchiveProjectionPath = (task: Task): string | undefined => {
  const resultPath = task.result?.archivePath?.trim()
  if (resultPath) return resultPath
  const archivePath = task.archivePath?.trim()
  return archivePath && archivePath.length > 0 ? archivePath : undefined
}

const syncTaskArchiveProjection = async (
  stateDir: string,
  task: Task,
): Promise<void> => {
  const archivePath = resolveTaskArchiveProjectionPath(task)
  const handoff = task.result?.handoff
  if (!archivePath || !handoff?.git) return
  const archived = await readTaskResultArchive(archivePath)
  if (!archived) return
  const currentGit = JSON.stringify(archived.handoff?.git ?? null)
  const nextGit = JSON.stringify(handoff.git)
  if (currentGit === nextGit) return

  let prompt: string | undefined
  try {
    const spec = await readTaskExecutionSpec(stateDir, task.executionSpecId)
    prompt = spec.prompt
  } catch {
    return
  }
  await writeTaskResultArchiveAtPath(archivePath, {
    taskId: archived.taskId,
    focusId: task.focusId,
    title: task.title,
    status: archived.status,
    ...(archived.taskStatus ? { taskStatus: archived.taskStatus } : {}),
    ...(archived.outcome ? { outcome: archived.outcome } : {}),
    ...(archived.stopReason ? { stopReason: archived.stopReason } : {}),
    prompt,
    output: archived.output,
    createdAt: task.createdAt,
    completedAt: archived.completedAt,
    durationMs: archived.durationMs,
    ...(archived.provider ? { provider: archived.provider } : {}),
    ...(archived.usage ? { usage: archived.usage } : {}),
    ...(archived.traceRef ? { traceRef: archived.traceRef } : {}),
    ...(archived.cancel ? { cancel: archived.cancel } : {}),
    handoff: {
      ...(archived.handoff ?? handoff),
      git: handoff.git,
    },
    ...(archived.evidence ? { evidence: archived.evidence } : {}),
  })
}

const syncReconciledTaskArchives = async (
  stateDir: string,
  tasks: Task[],
): Promise<void> => {
  for (const task of tasks) {
    await bestEffort('syncTaskArchiveProjection', () =>
      syncTaskArchiveProjection(stateDir, task),
    )
  }
}

const reconcileClosureTaskGitTruth = (tasks: Task[]): void => {
  for (const task of tasks) applyClosureTaskGitTruth(tasks, task)
}

export const hydrateRuntimeState = async (
  runtime: HydratableRuntimeState,
): Promise<void> => {
  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  const slice = buildRuntimeSnapshotHydrateSlice({
    snapshot,
    channelTargets: await restoreChannelTargetsFromHistory(
      runtime.paths.history,
      normalizeChannelTargets(snapshot.channelTargets),
    ),
  })
  applyRuntimeSnapshotHydrateSlice(runtime, slice)
  reconcileClosureTaskGitTruth(slice.domain.tasks)
  await syncReconciledTaskArchives(runtime.config.workDir, slice.domain.tasks)
  await reconcileRuntimeQueueState(runtime)

  if (snapshot.tasks.length > 0) {
    await bestEffort('appendLog: runtime_hydrated', () =>
      appendLog(runtime.paths.log, {
        event: 'runtime_hydrated',
        recoveredTaskCount: snapshot.tasks.length,
      }),
    )
  }
}

export const persistRuntimeState = async (
  runtime: RuntimeSnapshotPersistSlice,
): Promise<void> => {
  reconcileClosureTaskGitTruth(runtime.domain.tasks)
  const snapshot = buildRuntimeSnapshot(
    runtime,
    toPersistedMemoryRefreshState(runtime.process.manager.memoryRefresh),
  )
  runtime.domain.tasks = snapshot.tasks
  await saveRuntimeSnapshot(runtime.config.workDir, snapshot)
  await syncReconciledTaskArchives(runtime.config.workDir, snapshot.tasks)
}
