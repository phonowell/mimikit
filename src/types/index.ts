export type ISODate = string
export type Id = string

export type TokenUsage = {
  input?: number
  output?: number
  total?: number
}

export type TokenBudgetState = {
  date: string
  spent: number
}

export type Role = 'user' | 'manager' | 'system'
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

export type TaskKind = 'system_evolve'

export type TaskResultStatus = 'succeeded' | 'failed' | 'canceled'

export type Task = {
  id: Id
  fingerprint: string
  prompt: string
  title: string
  kind?: TaskKind
  status: TaskStatus
  createdAt: ISODate
  startedAt?: ISODate
  completedAt?: ISODate
  durationMs?: number
  attempts?: number
  usage?: TokenUsage
  archivePath?: string
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
}
