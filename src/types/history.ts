import type { Id, ISODate } from './common.js'
import type { TokenUsage } from './usage.js'

export type Role = 'user' | 'teller' | 'system'

export type HistoryMessage = {
  id: Id
  role: Role
  text: string
  createdAt: ISODate
  usage?: TokenUsage
  elapsedMs?: number
}
