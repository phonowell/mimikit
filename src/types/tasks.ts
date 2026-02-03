import type { Id, ISODate } from './common.js'

export type TaskStatus = 'pending' | 'done'

export type Task = {
  id: Id
  prompt: string
  status: TaskStatus
  createdAt: ISODate
}

export type TaskResult = {
  taskId: Id
  status: 'done'
  ok: boolean
  output: string
  durationMs: number
  completedAt: ISODate
}
