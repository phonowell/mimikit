import type { Id, ISODate, TokenUsage } from './common.js'

export type Role = 'user' | 'manager' | 'system'
export type MessageOrigin = 'api' | 'local'

export type HistoryMessage = {
  id: Id
  role: Role
  text: string
  createdAt: ISODate
  origin?: MessageOrigin
  usage?: TokenUsage
  elapsedMs?: number
}
