export type ISODate = string
export type Id = string

export type TokenUsage = {
  input?: number
  output?: number
  total?: number
}

export type Role = 'user' | 'manager' | 'system'
export type HistoryMessage = {
  id: Id
  role: Role
  text: string
  createdAt: ISODate
  usage?: TokenUsage
  elapsedMs?: number
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export type TaskResultStatus = 'succeeded' | 'failed' | 'canceled'

export type Task = {
  id: Id
  prompt: string
  title: string
  status: TaskStatus
  createdAt: ISODate
  startedAt?: ISODate
  completedAt?: ISODate
  durationMs?: number
  usage?: TokenUsage
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
