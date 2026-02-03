import type { Id, ISODate, TokenUsage } from './common.js'

export type Role = 'user' | 'manager' | 'system'

export type HistoryMessage = {
  id: Id
  role: Role
  text: string
  createdAt: ISODate
  usage?: TokenUsage
  elapsedMs?: number
}
