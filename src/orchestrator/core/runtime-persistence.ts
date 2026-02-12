import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../../storage/runtime-state.js'
import {
  loadInputQueueState,
  loadResultQueueState,
  saveInputQueueState,
  saveResultQueueState,
} from '../../streams/queues.js'

import type { RuntimeState } from './runtime-state.js'

export const hydrateRuntimeState = async (
  runtime: RuntimeState,
): Promise<void> => {
  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  runtime.tasks = snapshot.tasks
  if (snapshot.queues) {
    runtime.queues = {
      inputsCursor: snapshot.queues.inputsCursor,
      resultsCursor: snapshot.queues.resultsCursor,
    }
  }

  const inputQueueState = await loadInputQueueState(runtime.paths)
  const resultQueueState = await loadResultQueueState(runtime.paths)
  runtime.queues.inputsCursor = Math.max(
    runtime.queues.inputsCursor,
    inputQueueState.managerCursor,
  )
  runtime.queues.resultsCursor = Math.max(
    runtime.queues.resultsCursor,
    resultQueueState.managerCursor,
  )

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
    queues: runtime.queues,
  })
  await saveInputQueueState(runtime.paths, {
    managerCursor: runtime.queues.inputsCursor,
  })
  await saveResultQueueState(runtime.paths, {
    managerCursor: runtime.queues.resultsCursor,
  })
}
