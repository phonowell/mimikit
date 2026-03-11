import { hydrateMemoryRefreshState } from '../../memory/refresh/state.js'

import { selectPersistedFocusDigests } from './runtime-snapshot-persist.js'

import type { RuntimeState } from './runtime-state.js'
import type { RuntimeSnapshot } from '../../storage/runtime-snapshot-schema.js'

export type RuntimeSnapshotHydrateSlice = Pick<
  RuntimeState,
  'tasks' | 'taskPlans' | 'focuses' | 'focusDigests'
> & {
  manager: Pick<RuntimeState['manager'], 'turn' | 'threadId' | 'memoryRefresh'>
  session: Pick<RuntimeState['session'], 'channelTargets'>
  ui: Pick<RuntimeState['ui'], 'pendingUserChoices'>
  queues?: RuntimeState['queues']
}

export type RuntimeSnapshotHydrateTarget = Pick<
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

const selectRuntimeSnapshotQueues = (
  snapshot: RuntimeSnapshot,
): RuntimeState['queues'] | undefined => {
  if (!snapshot.queues) return undefined
  return {
    inputsCursor: snapshot.queues.inputsCursor,
    resultsCursor: snapshot.queues.resultsCursor,
  }
}

export const buildRuntimeSnapshotHydrateSlice = (params: {
  snapshot: RuntimeSnapshot
  channelTargets: RuntimeState['session']['channelTargets']
}): RuntimeSnapshotHydrateSlice => {
  const { snapshot, channelTargets } = params
  const slice: RuntimeSnapshotHydrateSlice = {
    tasks: snapshot.tasks,
    taskPlans: snapshot.taskPlans,
    focuses: snapshot.focuses ?? [],
    focusDigests: selectPersistedFocusDigests(snapshot.focusDigests ?? []),
    manager: {
      turn: snapshot.managerTurn ?? 0,
      ...(snapshot.managerThreadId
        ? { threadId: snapshot.managerThreadId }
        : {}),
      memoryRefresh: hydrateMemoryRefreshState(snapshot),
    },
    session: { channelTargets },
    ui: { pendingUserChoices: snapshot.pendingUserChoices ?? [] },
  }
  const queues = selectRuntimeSnapshotQueues(snapshot)
  if (queues) slice.queues = queues
  return slice
}

export const applyRuntimeSnapshotHydrateSlice = (
  runtime: RuntimeSnapshotHydrateTarget,
  slice: RuntimeSnapshotHydrateSlice,
): void => {
  runtime.tasks = slice.tasks
  runtime.taskPlans = slice.taskPlans
  runtime.focuses = slice.focuses
  runtime.focusDigests = slice.focusDigests
  runtime.manager.turn = slice.manager.turn
  if (slice.manager.threadId) runtime.manager.threadId = slice.manager.threadId
  else delete runtime.manager.threadId
  runtime.manager.memoryRefresh = slice.manager.memoryRefresh
  delete runtime.manager.lastContextPacket
  delete runtime.manager.lastUsage
  delete runtime.manager.usageTotal
  runtime.ui.pendingUserChoices = slice.ui.pendingUserChoices
  runtime.session.channelTargets = slice.session.channelTargets
  if (slice.queues) runtime.queues = slice.queues
}
