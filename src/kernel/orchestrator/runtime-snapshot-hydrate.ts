import { hydrateMemoryRefreshState } from '../../policy/memory/refresh/state.js'
import { reconcileTaskGitState } from '../../work/shared/task-git-lifecycle.js'

import type {
  RuntimeChannelTargets,
  RuntimeDomainState,
  RuntimeManagerState,
  RuntimeQueueState,
  RuntimeSessionState,
} from './runtime-interfaces.js'
import type { Task } from '../../foundation/types/index.js'
import type { RuntimeSnapshot } from '../../persistence/storage/runtime-snapshot-schema.js'

export type RuntimeSnapshotHydrateSlice = {
  domain: Omit<RuntimeDomainState, 'queues'>
  process: {
    manager: Pick<
      RuntimeManagerState,
      'turn' | 'threadId' | 'memoryRefresh' | 'lastUsage' | 'usageTotal'
    >
    session: Pick<RuntimeSessionState, 'channelTargets'>
  }
  queues?: RuntimeQueueState
}

export type RuntimeSnapshotHydrateTarget = {
  domain: Pick<RuntimeDomainState, 'tasks' | 'taskPlans' | 'focuses' | 'queues'>
  process: {
    manager: Pick<
      RuntimeManagerState,
      'turn' | 'threadId' | 'memoryRefresh' | 'lastUsage' | 'usageTotal'
    >
    session: Pick<RuntimeSessionState, 'channelTargets'>
  }
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
    domain: {
      tasks: recoverSnapshotTasks(snapshot.tasks),
      taskPlans: snapshot.taskPlans,
      focuses: snapshot.focuses ?? [],
    },
    process: {
      manager: {
        turn: snapshot.managerTurn ?? 0,
        ...(snapshot.managerThreadId
          ? { threadId: snapshot.managerThreadId }
          : {}),
        memoryRefresh: hydrateMemoryRefreshState(snapshot),
      },
      session: { channelTargets },
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
  runtime.domain.tasks = slice.domain.tasks
  runtime.domain.taskPlans = slice.domain.taskPlans
  runtime.domain.focuses = slice.domain.focuses
  runtime.process.manager.turn = slice.process.manager.turn
  if (slice.process.manager.threadId)
    runtime.process.manager.threadId = slice.process.manager.threadId
  else delete runtime.process.manager.threadId
  runtime.process.manager.memoryRefresh = slice.process.manager.memoryRefresh
  delete runtime.process.manager.lastUsage
  delete runtime.process.manager.usageTotal
  runtime.process.session.channelTargets = slice.process.session.channelTargets
  if (slice.queues) runtime.domain.queues = slice.queues
}
