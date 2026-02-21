import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
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
  runtime.cronJobs = snapshot.cronJobs ?? []
  runtime.managerTurn = snapshot.managerTurn ?? 0
  if (snapshot.plannerSessionId)
    runtime.plannerSessionId = snapshot.plannerSessionId
  else delete runtime.plannerSessionId
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
    cronJobs: runtime.cronJobs,
    managerTurn: runtime.managerTurn,
    queues: runtime.queues,
    ...(runtime.plannerSessionId
      ? { plannerSessionId: runtime.plannerSessionId }
      : {}),
    ...(runtime.managerCompressedContext
      ? { managerCompressedContext: runtime.managerCompressedContext }
      : {}),
  })
}
