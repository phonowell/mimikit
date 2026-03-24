import type { RuntimeState, UserMeta } from './runtime-state.js'

type RuntimeEnvelopeState = Pick<
  RuntimeState,
  'runtimeId' | 'startup' | 'config' | 'paths'
>

export type RuntimeSessionState = RuntimeState['session']
export type RuntimeManagerState = RuntimeState['manager']
export type RuntimeWorkerState = RuntimeState['worker']
export type RuntimeUiState = RuntimeState['ui']

export type RuntimeTaskCollection = RuntimeState['tasks']
export type RuntimeTaskState = RuntimeState['tasks'][number]
export type RuntimePlanCollection = RuntimeState['taskPlans']
export type RuntimeFocusCollection = RuntimeState['focuses']
export type RuntimeQueueState = RuntimeState['queues']
export type RuntimePendingUserChoices = RuntimeState['ui']['pendingUserChoices']
export type RuntimeChannelTargets = RuntimeState['session']['channelTargets']
export type RuntimePathsState = Pick<RuntimeState, 'paths'>
export type RuntimeUserMeta = UserMeta

export type RuntimeDomainState = Pick<
  RuntimeState,
  'tasks' | 'taskPlans' | 'focuses' | 'queues'
> & {
  manager: Pick<RuntimeManagerState, 'turn' | 'threadId' | 'memoryRefresh'>
  session: Pick<RuntimeSessionState, 'channelTargets'>
  ui: Pick<RuntimeUiState, 'pendingUserChoices'>
}

export type RuntimeProcessState = {
  session: Omit<RuntimeSessionState, 'channelTargets'>
  manager: Omit<RuntimeManagerState, 'turn' | 'threadId' | 'memoryRefresh'>
  worker: RuntimeWorkerState
  ui: Omit<RuntimeUiState, 'pendingUserChoices'>
}

export type ManagerRuntime = RuntimeEnvelopeState &
  Pick<RuntimeState, 'tasks' | 'taskPlans' | 'focuses' | 'queues'> & {
    session: RuntimeSessionState
    manager: RuntimeManagerState
    worker: RuntimeWorkerState
    ui: RuntimeUiState
  }

export type WorkerRuntime = OrchestratorRuntime

export type OrchestratorRuntime = RuntimeEnvelopeState &
  Pick<RuntimeState, 'tasks' | 'taskPlans' | 'focuses' | 'queues'> & {
    session: RuntimeSessionState
    manager: RuntimeManagerState
    worker: RuntimeWorkerState
    ui: RuntimeUiState
  }

export type FocusRuntime = OrchestratorRuntime

export type SurfaceRuntime = OrchestratorRuntime

export type ChannelRuntime = Pick<RuntimeState, 'config' | 'paths'> & {
  session: Pick<RuntimeSessionState, 'channelTargets'>
}
