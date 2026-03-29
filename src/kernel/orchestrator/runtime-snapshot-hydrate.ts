import { hydrateMemoryRefreshState } from '../../policy/memory/refresh/state.js'
import { reconcileTaskGitState } from '../../work/shared/task-git-lifecycle.js'

import type {
  RuntimeChannelTargets,
  RuntimeDomainState,
  RuntimeManagerState,
  RuntimeQueueState,
} from './runtime-interfaces.js'
import type { Task } from '../../foundation/types/index.js'
import type { RuntimeSnapshot } from '../../persistence/storage/runtime-snapshot-schema.js'

export type RuntimeSnapshotHydrateSlice = Omit<RuntimeDomainState, 'queues'> & {
  queues?: RuntimeQueueState
}

export type RuntimeSnapshotHydrateTarget = Pick<
  RuntimeDomainState,
  'tasks' | 'taskPlans' | 'focuses' | 'queues' | 'session' | 'ui'
> & {
  manager: Pick<
    RuntimeManagerState,
    'turn' | 'threadId' | 'memoryRefresh' | 'lastUsage' | 'usageTotal'
  >
}

const selectRuntimeSnapshotQueues = (
  snapshot: RuntimeSnapshot,
): RuntimeQueueState | undefined => {
  if (!snapshot.queues) return undefined
  return {
    inputsCursor: snapshot.queues.inputsCursor,
    resultsCursor: snapshot.queues.resultsCursor,
  }
}

const toRecoveredPendingTask = (task: Task): Task => {
  const {
    startedAt: _startedAt,
    completedAt: _completedAt,
    durationMs: _durationMs,
    result: _result,
    usage: _usage,
    attempts: _attempts,
    ...rest
  } = task
  return {
    ...rest,
    status: 'pending',
  }
}

const recoverSnapshotTasks = (tasks: RuntimeSnapshot['tasks']): Task[] =>
  tasks.map((task) =>
    reconcileTaskGitState(
      task.status === 'running' ? toRecoveredPendingTask(task) : { ...task },
    ),
  )

export const buildRuntimeSnapshotHydrateSlice = (params: {
  snapshot: RuntimeSnapshot
  channelTargets: RuntimeChannelTargets
}): RuntimeSnapshotHydrateSlice => {
  const { snapshot, channelTargets } = params
  const slice: RuntimeSnapshotHydrateSlice = {
    tasks: recoverSnapshotTasks(snapshot.tasks),
    taskPlans: snapshot.taskPlans,
    focuses: snapshot.focuses ?? [],
    manager: {
      turn: snapshot.managerTurn ?? 0,
      ...(snapshot.managerThreadId
        ? { threadId: snapshot.managerThreadId }
        : {}),
      memoryRefresh: hydrateMemoryRefreshState(snapshot),
    },
    session: { channelTargets },
    ui: {
      wakeVersion: 0,
      wakeEvents: new Map(),
      signalControllers: new Set(),
    },
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
  runtime.manager.turn = slice.manager.turn
  if (slice.manager.threadId) runtime.manager.threadId = slice.manager.threadId
  else delete runtime.manager.threadId
  runtime.manager.memoryRefresh = slice.manager.memoryRefresh
  delete runtime.manager.lastUsage
  delete runtime.manager.usageTotal
  runtime.session.channelTargets = slice.session.channelTargets
  if (slice.queues) runtime.queues = slice.queues
}
