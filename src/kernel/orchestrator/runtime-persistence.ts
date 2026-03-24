import { readHistory } from '../../persistence/history/store.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
} from '../../persistence/storage/runtime-snapshot.js'
import { toPersistedMemoryRefreshState } from '../../policy/memory/refresh/state.js'
import { restoreTaskResumeChoiceOnHydrate } from '../../work/orchestrator/task-resume-choice.js'

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

const restoreChannelTargetsFromHistory = async (
  historyPath: string,
  currentTargets: RuntimeChannelTargets = {},
): Promise<RuntimeChannelTargets> => {
  const history = await readHistory(historyPath)
  let { telegramChatId } = currentTargets
  let { feishuChatId } = currentTargets
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (!item) break
    if (
      'telegramChatId' in item &&
      typeof item.telegramChatId === 'string' &&
      !telegramChatId
    )
      telegramChatId = item.telegramChatId.trim()
    if (
      'feishuChatId' in item &&
      typeof item.feishuChatId === 'string' &&
      !feishuChatId
    )
      feishuChatId = item.feishuChatId.trim()
    if (telegramChatId && feishuChatId) break
  }
  return normalizeChannelTargets({
    ...(telegramChatId ? { telegramChatId } : {}),
    ...(feishuChatId ? { feishuChatId } : {}),
  })
}

type HydratableRuntimeState = RuntimeSnapshotHydrateTarget &
  RuntimePathsState & {
    config: { workDir: string }
  }

export const hydrateRuntimeState = async (
  runtime: HydratableRuntimeState,
): Promise<void> => {
  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  applyRuntimeSnapshotHydrateSlice(
    runtime,
    buildRuntimeSnapshotHydrateSlice({
      snapshot,
      channelTargets: await restoreChannelTargetsFromHistory(
        runtime.paths.history,
        normalizeChannelTargets(snapshot.channelTargets),
      ),
    }),
  )
  await reconcileRuntimeQueueState(runtime)
  restoreTaskResumeChoiceOnHydrate(runtime)

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
  await saveRuntimeSnapshot(
    runtime.config.workDir,
    buildRuntimeSnapshot(
      runtime,
      toPersistedMemoryRefreshState(runtime.manager.memoryRefresh),
    ),
  )
}
