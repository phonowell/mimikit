import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../../persistence/storage/runtime-schema-version.js'
import { selectPersistedTasks } from '../../persistence/storage/runtime-snapshot.js'
import { canStoreFocusDetails } from '../../work/focus/reserved.js'

import type {
  RuntimeFocusCollection,
  RuntimePersistState,
} from './runtime-interfaces.js'
import type { RuntimeSnapshot } from '../../persistence/storage/runtime-snapshot-schema.js'

export type RuntimeSnapshotPersistSlice = RuntimePersistState

export const normalizeChannelTargets = (
  value:
    | {
        telegramChatId?: string | undefined
      }
    | undefined,
) => {
  const telegramChatId = value?.telegramChatId?.trim()
  return {
    ...(telegramChatId ? { telegramChatId } : {}),
  }
}

const selectPersistedFocuses = (
  focuses: RuntimeFocusCollection,
): RuntimeSnapshot['focuses'] =>
  focuses.map((focus) =>
    canStoreFocusDetails(focus.id)
      ? { ...focus }
      : {
          id: focus.id,
          title: focus.title,
          status: focus.status,
          createdAt: focus.createdAt,
          updatedAt: focus.updatedAt,
          lastActivityAt: focus.lastActivityAt,
        },
  )

export const buildRuntimeSnapshot = (
  runtime: RuntimeSnapshotPersistSlice,
  memoryRefresh: RuntimeSnapshot['memoryRefresh'],
): RuntimeSnapshot => {
  const channelTargets = normalizeChannelTargets(
    runtime.process.session.channelTargets,
  )
  return {
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    tasks: selectPersistedTasks(runtime.domain.tasks),
    taskPlans: runtime.domain.taskPlans,
    focuses: selectPersistedFocuses(runtime.domain.focuses),
    managerTurn: runtime.process.manager.turn,
    ...(runtime.process.manager.threadId
      ? { managerThreadId: runtime.process.manager.threadId }
      : {}),
    queues: runtime.domain.queues,
    ...(Object.keys(channelTargets).length > 0 ? { channelTargets } : {}),
    memoryRefresh,
  }
}
