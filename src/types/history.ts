import type { Id, ISODate } from './common.js'

export type Role = 'user' | 'assistant'

export type HistoryMessage = {
  id: Id
  role: Role
  text: string
  createdAt: ISODate
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
