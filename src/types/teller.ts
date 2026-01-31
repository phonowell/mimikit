import type { Id, ISODate } from './common.js'

export type TellerEvent =
  | {
      id: Id
      kind: 'task_result'
      createdAt: ISODate
      taskId: Id
      status: 'done' | 'failed'
      result?: string
      error?: string
    }
  | {
      id: Id
      kind: 'needs_input'
      createdAt: ISODate
      question: string
      options?: string[]
      default?: string
    }
  | {
      id: Id
      kind: 'planner_failed'
      createdAt: ISODate
      error: string
    }
