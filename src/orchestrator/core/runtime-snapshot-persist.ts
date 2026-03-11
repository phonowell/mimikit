import { canPersistFocusDigest } from '../../focus/reserved.js'
import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../../storage/runtime-schema-version.js'
import { selectPersistedTasks } from '../../storage/runtime-snapshot.js'

import type { RuntimeState } from './runtime-state.js'
import type { RuntimeSnapshot } from '../../storage/runtime-snapshot-schema.js'

export type RuntimeSnapshotPersistSlice = Pick<
  RuntimeState,
  'config' | 'tasks' | 'taskPlans' | 'focuses' | 'focusDigests' | 'queues'
> & {
  manager: Pick<RuntimeState['manager'], 'turn' | 'threadId' | 'memoryRefresh'>
  session: Pick<RuntimeState['session'], 'channelTargets'>
  ui: Pick<RuntimeState['ui'], 'pendingUserChoices'>
}

export const selectPersistedFocusDigests = (
  focusDigests: RuntimeState['focusDigests'],
): NonNullable<RuntimeSnapshot['focusDigests']> =>
  focusDigests.filter((item) => canPersistFocusDigest(item.focusId))

export const normalizeChannelTargets = (
  value:
    | {
        telegramChatId?: string | undefined
        feishuChatId?: string | undefined
      }
    | undefined,
) => {
  const telegramChatId = value?.telegramChatId?.trim()
  const feishuChatId = value?.feishuChatId?.trim()
  return {
    ...(telegramChatId ? { telegramChatId } : {}),
    ...(feishuChatId ? { feishuChatId } : {}),
  }
}

export const buildRuntimeSnapshot = (
  runtime: RuntimeSnapshotPersistSlice,
  memoryRefresh: RuntimeSnapshot['memoryRefresh'],
): RuntimeSnapshot => {
  const channelTargets = normalizeChannelTargets(runtime.session.channelTargets)
  return {
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    tasks: selectPersistedTasks(runtime.tasks),
    taskPlans: runtime.taskPlans,
    focuses: runtime.focuses,
    focusDigests: selectPersistedFocusDigests(runtime.focusDigests),
    managerTurn: runtime.manager.turn,
    ...(runtime.manager.threadId
      ? { managerThreadId: runtime.manager.threadId }
      : {}),
    queues: runtime.queues,
    ...(Object.keys(channelTargets).length > 0 ? { channelTargets } : {}),
    ...(runtime.ui.pendingUserChoices.length > 0
      ? { pendingUserChoices: runtime.ui.pendingUserChoices }
      : {}),
    memoryRefresh,
  }
}
