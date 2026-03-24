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
  recoverable?: boolean
  stopReason?: string
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

export type PlanView = {
  id?: string
  title?: string
  status?: string
  updatedAt?: string
  archivedAt?: string
  lastTaskId?: string
  trigger?: PlanTrigger
}

export type PlansSnapshot = {
  items: PlanView[]
}

export type FocusView = {
  id: string
  title: string
  status: string
  updatedAt: string
  lastActivityAt: string
  lastTaskId?: string
  summary?: string
  openItems?: string[]
}

export type FocusesSnapshot = {
  items: FocusView[]
}

export type ChoiceOption = {
  id: string
  label: string
  reason: string
}

export type ChoiceView = {
  id: string
  question: string
  defaultOptionId: string
  expiresAt?: string
  options: ChoiceOption[]
}

export type SnapshotEnvelope = {
  status?: StatusSnapshot
  messages?: MessageSnapshot
  tasks?: TasksSnapshot
  plans?: PlansSnapshot
  focuses?: FocusesSnapshot
  choices?: unknown
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

export type ToastState = {
  message: string
  state: '' | 'success' | 'error'
}

export type AppState = {
  status: StatusSnapshot
  messages: ChatMessage[]
  tasks: TaskView[]
  plans: PlanView[]
  focuses: FocusView[]
  choices: ChoiceView[]
  awaitingReply: boolean
}
