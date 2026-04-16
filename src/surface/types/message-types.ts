import type {
  FocusId,
  Id,
  ISODate,
  MessageVisibility,
  Role,
  TokenUsage,
} from '../../foundation/types/base.js'
import type { SurfaceArtifactLink } from '../shared/artifact-link.js'

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
  usage?: TokenUsage
  elapsedMs?: number
  quote?: Id
  artifacts?: SurfaceArtifactLink[]
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
  artifacts?: SurfaceArtifactLink[]
}

export type HistoryMessage = NonSystemHistoryMessage | SystemHistoryMessage

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
