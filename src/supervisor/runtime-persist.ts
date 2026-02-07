import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../storage/runtime-state.js'

import type { RuntimeState } from './runtime.js'

export const hydrateRuntimeState = async (
  runtime: RuntimeState,
): Promise<void> => {
  const snapshot = await loadRuntimeSnapshot(runtime.config.stateDir)
  runtime.tasks = snapshot.tasks
  if (snapshot.tokenBudget) runtime.tokenBudget = snapshot.tokenBudget
  if (snapshot.evolve) runtime.evolveState = snapshot.evolve
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
  await saveRuntimeSnapshot(runtime.config.stateDir, {
    tasks: selectPersistedTasks(runtime.tasks),
    tokenBudget: runtime.tokenBudget,
    evolve: runtime.evolveState,
  })
}
