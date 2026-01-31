import type { Id, ISODate } from './common.js'
import type { TokenUsage } from './usage.js'

export type Role = 'user' | 'agent'

export type HistoryMessage = {
  id: Id
  role: Role
  text: string
  createdAt: ISODate
  usage?: TokenUsage
  elapsedMs?: number
  archived?: boolean | 'pending'
  archiveAttempts?: number
  archiveFailedAt?: ISODate
  archiveNextAt?: ISODate
}

export type PendingQuestion = {
  questionId: Id
  question: string
  options?: string[]
  timeout: number
  default?: string
  createdAt: ISODate
  expiresAt: ISODate
}
