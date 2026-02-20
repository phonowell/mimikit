export type ISODate = string
export type Id = string

export type TokenUsage = {
  input?: number
  output?: number
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
  quote?: Id
}

type UserInputSystem = {
  id: Id
  role: 'system'
  visibility: MessageVisibility
  text: string
  createdAt: ISODate
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

export type WorkerProfile = 'standard' | 'specialist' | 'deferred'

export type Task = {
  id: Id
  fingerprint: string
  prompt: string
  title: string
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
  profile: WorkerProfile
  enabled: boolean
  disabledReason?: CronJobDisabledReason
  createdAt: ISODate
  lastTriggeredAt?: ISODate
}

export type ManagerEnv = {
  lastUser?: {
    clientTimeZone?: string
    clientNowIso?: string
  }
}

export type ManagerActionFeedback = {
  action: string
  error: string
  hint: string
  attempted?: string
}
