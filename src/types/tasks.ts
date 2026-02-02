import type { Id, ISODate } from './common.js'

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'timeout'

export type Task = {
  id: Id
  prompt: string
  priority: number
  status: TaskStatus
  createdAt: ISODate
  blockedBy?: Id[]
  scheduledAt?: ISODate
}

export type TaskResult = {
  taskId: Id
  status: 'done' | 'failed' | 'timeout'
  output: string
  durationMs: number
  completedAt: ISODate
}
