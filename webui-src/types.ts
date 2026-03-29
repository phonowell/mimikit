export type AgentStatus =
  | 'loading'
  | 'idle'
  | 'running'
  | 'disconnected'
  | 'restarting'
  | 'resetting'
  | string

export type StatusSnapshot = {
  agentStatus: AgentStatus
  activeTasks?: number
  pendingTasks?: number
  pendingInputs?: number
  managerRunning?: boolean
  maxWorkers?: number
  runtimeId?: string
}

export type MessageRole = 'agent' | 'user' | 'system' | string

export type MessageUsage = {
  input?: number
  output?: number
  inputCacheRead?: number
  inputCacheWrite?: number
  outputCache?: number
  total?: number
  sessionTotal?: number
}

export type ChatMessage = {
  id?: string
  role: MessageRole
  text: string
  visibility?: string
  createdAt?: string
  quote?: string
  focusId?: string
  systemEventName?: string
  usage?: MessageUsage
  elapsedMs?: number
}

export type MessageSnapshot = {
  messages: ChatMessage[]
  mode?: 'full' | 'delta' | string
}

export type TaskGitClosure = {
  reviewPassed?: boolean
  merged?: boolean
  cleaned?: boolean
}

export type TaskDispatchLockDetail = {
  blockerTaskId: string
  lockKey: string
}

export type TaskView = {
  id: string
  status: string
  provider?: string
  title: string
  createdAt: string
  changeAt: string
  startedAt?: string
  pausedAt?: string
  completedAt?: string
  durationMs?: number
  usage?: MessageUsage
  pending_reason?: string
  dispatchLock?: TaskDispatchLockDetail
  stopReason?: string
  traceRef?: string
  liveOutput?: string
  gitClosure?: TaskGitClosure
}

export type TasksSnapshot = {
  tasks: TaskView[]
}

export type PlanTrigger = {
  mode?: string
  cron?: string
  scheduledAt?: string
}

export type PlanTaskContractView = {
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string
  contextRefs?: string[]
}

export type PlanView = {
  id?: string
  title?: string
  status?: string
  updatedAt?: string
  runCount?: number
  archivedAt?: string
  lastTriggeredAt?: string
  lastTaskId?: string
  doneReason?: string
  trigger?: PlanTrigger
  taskContract?: PlanTaskContractView
}

export type PlansSnapshot = {
  items: PlanView[]
}

export type SnapshotEnvelope = {
  status?: StatusSnapshot
  messages?: MessageSnapshot
  tasks?: TasksSnapshot
  plans?: PlansSnapshot
}

export type QuoteState = {
  id: string
  label: string
  text: string
  role: string
}

export type ConfirmDialogState =
  | { kind: 'message'; id: string }
  | { kind: 'task'; id: string; title: string }
  | { kind: 'restart' }
  | { kind: 'reset' }

export type AppState = {
  status: StatusSnapshot
  messages: ChatMessage[]
  tasks: TaskView[]
  plans: PlanView[]
  awaitingReply: boolean
}
