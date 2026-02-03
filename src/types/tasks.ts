import type { Id, ISODate, TokenUsage } from './common.js'

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
