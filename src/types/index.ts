export type ISODate = string
export type Id = string

export type TokenUsage = {
  input?: number
  output?: number
  total?: number
}

export type Role = 'user' | 'assistant' | 'system'
export type HistoryMessage = {
  id: Id
  role: Role
  text: string
  createdAt: ISODate
  usage?: TokenUsage
  elapsedMs?: number
  quote?: Id
}

export type UserInput = {
  id: Id
  text: string
  createdAt: ISODate
  quote?: Id
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export type TaskCancelSource = 'user' | 'manager' | 'system'

export type TaskCancelMeta = {
  source: TaskCancelSource
  reason?: string
}

export type TaskResultStatus = 'succeeded' | 'failed' | 'canceled'

export type WorkerProfile = 'standard' | 'specialist'

export type Task = {
  id: Id
  fingerprint: string
  prompt: string
  title: string
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

export type ManagerEnv = {
  lastUser?: {
    clientTimeZone?: string
    clientNowIso?: string
  }
}
