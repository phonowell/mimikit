import type {
  FocusId,
  Id,
  ISODate,
  MessageVisibility,
  Role,
  TokenUsage,
} from './base.js'

type NonSystemHistoryMessage = {
  id: Id
  role: Exclude<Role, 'system'>
  text: string
  createdAt: ISODate
  focusId: FocusId
  source?: string
  platform?: string
  telegramChatId?: string
  telegramMessageId?: string
  telegramUpdateId?: string
  telegramTimestamp?: ISODate
  feishuChatId?: string
  feishuMessageId?: string
  feishuEventId?: string
  feishuTimestamp?: ISODate
  usage?: TokenUsage
  elapsedMs?: number
  quote?: Id
}

type SystemHistoryMessage = {
  id: Id
  role: 'system'
  visibility: MessageVisibility
  text: string
  createdAt: ISODate
  focusId: FocusId
  systemEventName?: string
  systemEventPayload?: Record<string, unknown>
  usage?: TokenUsage
  elapsedMs?: number
  quote?: Id
}

export type HistoryMessage = NonSystemHistoryMessage | SystemHistoryMessage

export type ReadFileLookupMessage = {
  path: string
  status: 'ok' | 'error'
  encoding: 'utf-8'
  chars?: number
  fromLine?: number
  lineCount?: number
  totalLines?: number
  truncated?: boolean
  content?: string
  error?: string
}

type UserInputUser = {
  id: Id
  role: 'user'
  text: string
  createdAt: ISODate
  focusId: FocusId
  quote?: Id
  source?: string
  platform?: string
  telegramChatId?: string
  telegramMessageId?: string
  telegramUpdateId?: string
  telegramTimestamp?: ISODate
  feishuChatId?: string
  feishuMessageId?: string
  feishuEventId?: string
  feishuTimestamp?: ISODate
}

type UserInputSystem = {
  id: Id
  role: 'system'
  visibility: MessageVisibility
  text: string
  createdAt: ISODate
  focusId: FocusId
  systemEventName?: string
  systemEventPayload?: Record<string, unknown>
  quote?: Id
}

export type UserInput = UserInputUser | UserInputSystem
