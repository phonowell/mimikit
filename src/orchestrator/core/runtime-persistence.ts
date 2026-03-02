import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import {
  hydrateMemoryRefreshState,
  toPersistedMemoryRefreshState,
} from '../../memory/refresh/state.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../../storage/runtime-snapshot.js'

import type { RuntimeState } from './runtime-state.js'

export const hydrateRuntimeState = async (
  runtime: RuntimeState,
): Promise<void> => {
  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  runtime.tasks = snapshot.tasks
  runtime.taskPlans = snapshot.taskPlans
  runtime.focuses = snapshot.focuses ?? []
  runtime.focusContexts = snapshot.focusContexts ?? []
  runtime.activeFocusIds = snapshot.activeFocusIds ?? []
  runtime.managerTurn = snapshot.managerTurn ?? 0
  runtime.memoryRefresh = hydrateMemoryRefreshState(snapshot)
  runtime.pendingUserChoice = snapshot.pendingUserChoice ?? null
  if (snapshot.managerCompressedContext)
    runtime.managerCompressedContext = snapshot.managerCompressedContext
  else delete runtime.managerCompressedContext
  if (snapshot.queues) {
    runtime.queues = {
      inputsCursor: snapshot.queues.inputsCursor,
      resultsCursor: snapshot.queues.resultsCursor,
    }
  }

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
  runtime: RuntimeState,
): Promise<void> => {
  await saveRuntimeSnapshot(runtime.config.workDir, {
    tasks: selectPersistedTasks(runtime.tasks),
    taskPlans: runtime.taskPlans,
    focuses: runtime.focuses,
    focusContexts: runtime.focusContexts,
    activeFocusIds: runtime.activeFocusIds,
    managerTurn: runtime.managerTurn,
    queues: runtime.queues,
    ...(runtime.pendingUserChoice
      ? { pendingUserChoice: runtime.pendingUserChoice }
      : {}),
    memoryRefresh: toPersistedMemoryRefreshState(runtime.memoryRefresh),
    ...(runtime.managerCompressedContext
      ? { managerCompressedContext: runtime.managerCompressedContext }
      : {}),
  })
}
