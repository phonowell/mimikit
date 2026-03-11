import { hydrateMemoryRefreshState } from '../../memory/refresh/state.js'

import { selectPersistedFocusDigests } from './runtime-snapshot-persist.js'

import type { RuntimeState } from './runtime-state.js'
import type { RuntimeSnapshot } from '../../storage/runtime-snapshot-schema.js'

export type RuntimeSnapshotHydrateSlice = Pick<
  RuntimeState,
  'tasks' | 'taskPlans' | 'focuses' | 'focusDigests' | 'queues'
> & {
  manager: Pick<
    RuntimeState['manager'],
    | 'turn'
    | 'threadId'
    | 'memoryRefresh'
    | 'lastContextPacket'
    | 'lastUsage'
    | 'usageTotal'
  >
  session: Pick<RuntimeState['session'], 'channelTargets'>
  ui: Pick<RuntimeState['ui'], 'pendingUserChoices'>
}

export const applyRuntimeSnapshot = (
  runtime: RuntimeSnapshotHydrateSlice,
  params: {
    snapshot: RuntimeSnapshot
    channelTargets: RuntimeState['session']['channelTargets']
  },
): void => {
  const { snapshot, channelTargets } = params
  runtime.tasks = snapshot.tasks
  runtime.taskPlans = snapshot.taskPlans
  runtime.focuses = snapshot.focuses ?? []
  runtime.focusDigests = selectPersistedFocusDigests(
    snapshot.focusDigests ?? [],
  )
  runtime.manager.turn = snapshot.managerTurn ?? 0
  if (snapshot.managerThreadId)
    runtime.manager.threadId = snapshot.managerThreadId
  else delete runtime.manager.threadId
  runtime.manager.memoryRefresh = hydrateMemoryRefreshState(snapshot)
  delete runtime.manager.lastContextPacket
  delete runtime.manager.lastUsage
  delete runtime.manager.usageTotal
  runtime.ui.pendingUserChoices = snapshot.pendingUserChoices ?? []
  runtime.session.channelTargets = channelTargets
  if (!snapshot.queues) return
  runtime.queues = {
    inputsCursor: snapshot.queues.inputsCursor,
    resultsCursor: snapshot.queues.resultsCursor,
  }
}
