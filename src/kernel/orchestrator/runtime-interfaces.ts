import type { RuntimeState, UserMeta } from './runtime-state.js'

type RuntimeEnvelopeState = Pick<
  RuntimeState,
  'runtimeId' | 'startup' | 'config' | 'paths'
>

export type RuntimeDomainState = RuntimeState['domain']
export type RuntimeProcessState = RuntimeState['process']
export type RuntimeSessionState = RuntimeState['process']['session']
export type RuntimeManagerState = RuntimeState['process']['manager']
export type RuntimeWorkerState = RuntimeState['process']['worker']
export type RuntimeUiState = RuntimeState['process']['ui']

export type RuntimeTaskCollection = RuntimeState['domain']['tasks']
export type RuntimeTaskState = RuntimeState['domain']['tasks'][number]
export type RuntimePlanCollection = RuntimeState['domain']['taskPlans']
export type RuntimeFocusCollection = RuntimeState['domain']['focuses']
export type RuntimeQueueState = RuntimeState['domain']['queues']
export type RuntimeChannelTargets =
  RuntimeState['process']['session']['channelTargets']
export type RuntimePathsState = Pick<RuntimeState, 'paths'>
export type RuntimeUserMeta = UserMeta
export type RuntimeTaskStateSlice = {
  domain: Pick<RuntimeDomainState, 'tasks'>
}
export type RuntimeTaskFocusStateSlice = {
  domain: Pick<RuntimeDomainState, 'tasks' | 'focuses'>
}
export type RuntimePlanStateSlice = {
  domain: Pick<RuntimeDomainState, 'taskPlans'>
}
export type RuntimePlanFocusStateSlice = {
  domain: Pick<RuntimeDomainState, 'taskPlans' | 'focuses'>
}
export type RuntimeFocusStateSlice = {
  domain: Pick<RuntimeDomainState, 'focuses'>
}

export type RuntimePersistState = Pick<RuntimeState, 'config'> & {
  domain: Pick<RuntimeDomainState, 'tasks' | 'taskPlans' | 'focuses' | 'queues'>
  process: {
    manager: Pick<
      RuntimeManagerState,
      'turn' | 'threadId' | 'memoryRefresh' | 'lastUsage' | 'usageTotal'
    >
    session: Pick<RuntimeSessionState, 'channelTargets'>
    ui: RuntimeUiState
  }
}

export type ManagerRuntime = RuntimeEnvelopeState & {
  domain: RuntimeDomainState
  process: RuntimeProcessState
}

export type WorkerRuntime = OrchestratorRuntime

export type OrchestratorRuntime = ManagerRuntime

export type FocusRuntime = OrchestratorRuntime

export type SurfaceRuntime = OrchestratorRuntime

export type ChannelRuntime = Pick<RuntimeState, 'config' | 'paths'> & {
  process: {
    session: Pick<RuntimeSessionState, 'channelTargets'>
  }
}
