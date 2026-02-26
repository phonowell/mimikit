export type ISODate = string
export type Id = string
export type FocusId = string

export type TokenUsage = {
  input?: number
  inputCacheRead?: number
  inputCacheWrite?: number
  output?: number
  outputCache?: number
  total?: number
  sessionTotal?: number
}

export type Role = 'user' | 'agent' | 'system'
export type MessageVisibility = 'user' | 'agent' | 'all'
type NonSystemHistoryMessage = {
  id: Id
  role: Exclude<Role, 'system'>
  text: string
  createdAt: ISODate
  focusId: FocusId
  usage?: TokenUsage
  elapsedMs?: number
  quote?: Id
}

type SystemHistoryMessage = {
  id: Id
  role: 'system'
  visibility: MessageVisibility
  text: string
  createdAt: ISODate
  focusId: FocusId
  usage?: TokenUsage
  elapsedMs?: number
  quote?: Id
}

export type HistoryMessage = NonSystemHistoryMessage | SystemHistoryMessage

export type HistoryLookupMessage = {
  id: Id
  role: Role
  time: ISODate
  content: string
  score: number
}

type UserInputUser = {
  id: Id
  role: 'user'
  text: string
  createdAt: ISODate
  focusId: FocusId
  quote?: Id
}

type UserInputSystem = {
  id: Id
  role: 'system'
  visibility: MessageVisibility
  text: string
  createdAt: ISODate
  focusId: FocusId
  quote?: Id
}

export type UserInput = UserInputUser | UserInputSystem

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export type TaskCancelSource = 'user' | 'deferred' | 'system'

export type TaskCancelMeta = {
  source: TaskCancelSource
  reason?: string
}

export type TaskResultStatus = Extract<
  TaskStatus,
  'succeeded' | 'failed' | 'canceled'
>

export type WorkerProfile = 'worker'

export type IntentPriority = 'high' | 'normal' | 'low'
export type IdleIntentStatus = 'pending' | 'blocked' | 'done'
export type IntentSource = 'user_request' | 'agent_auto' | 'retry_decision'
export type IntentTriggerMode = 'one_shot' | 'on_idle'
export type FocusStatus = 'active' | 'idle' | 'done' | 'archived'

export type IdleIntentTriggerPolicy = {
  mode: IntentTriggerMode
  cooldownMs: number
}

export type IdleIntentTriggerState = {
  totalTriggered: number
  lastCompletedAt?: ISODate
}

export type FocusMeta = {
  id: FocusId
  title: string
  status: FocusStatus
  createdAt: ISODate
  updatedAt: ISODate
  lastActivityAt: ISODate
}

export type FocusContext = {
  focusId: FocusId
  summary?: string
  openItems?: string[]
  updatedAt: ISODate
}

export type IdleIntent = {
  id: Id
  prompt: string
  title: string
  focusId: FocusId
  priority: IntentPriority
  status: IdleIntentStatus
  source: IntentSource
  createdAt: ISODate
  updatedAt: ISODate
  attempts: number
  maxAttempts: number
  triggerPolicy: IdleIntentTriggerPolicy
  triggerState: IdleIntentTriggerState
  lastTaskId?: Id
  archivedAt?: ISODate
}

export type Task = {
  id: Id
  fingerprint: string
  prompt: string
  title: string
  focusId: FocusId
  cron?: string
  profile: WorkerProfile
  status: TaskStatus
  createdAt: ISODate
  startedAt?: ISODate
  completedAt?: ISODate
  durationMs?: number
  attempts?: number
  usage?: TokenUsage
  archivePath?: string
  cancel?: TaskCancelMeta
  result?: TaskResult
}

export type TaskResult = {
  taskId: Id
  status: TaskResultStatus
  ok: boolean
  output: string
  durationMs: number
  completedAt: ISODate
  usage?: TokenUsage
  title?: string
  archivePath?: string
  profile?: WorkerProfile
  cancel?: TaskCancelMeta
}

export type JsonPacket<TPayload> = {
  id: string
  createdAt: string
  payload: TPayload
}

export type CronJobDisabledReason = 'canceled' | 'completed'

export type CronJob = {
  id: Id
  cron?: string
  scheduledAt?: ISODate
  prompt: string
  title: string
  focusId: FocusId
  profile: WorkerProfile
  enabled: boolean
  disabledReason?: CronJobDisabledReason
  createdAt: ISODate
  lastTriggeredAt?: ISODate
}

export type ManagerEnv = {
  lastUser?: {
    clientLocale?: string
    clientTimeZone?: string
    clientOffsetMinutes?: number
    clientNowIso?: string
  }
}

export type ManagerActionFeedback = {
  action: string
  error: string
  hint: string
  attempted?: string
}
