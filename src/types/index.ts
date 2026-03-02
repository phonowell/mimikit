import type {
  focusContextSchema,
  focusMetaSchema,
  taskCancelSchema,
  taskResultSchema,
  taskSchema,
  taskTemplateSchema,
  taskTemplateTriggerSchema,
} from '../storage/runtime-snapshot-schema.js'
import type { z } from 'zod'

export type ISODate = string
export type Id = string
export type FocusId = string

export type TokenUsage = {
  input?: number | undefined
  inputCacheRead?: number | undefined
  inputCacheWrite?: number | undefined
  output?: number | undefined
  outputCache?: number | undefined
  total?: number | undefined
  sessionTotal?: number | undefined
}

export type Role = 'user' | 'agent' | 'system'
export type MessageVisibility = 'user' | 'agent' | 'all'

type NonSystemHistoryMessage = {
  id: Id
  role: Exclude<Role, 'system'>
  text: string
  createdAt: ISODate
  focusId: FocusId
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
  usage?: TokenUsage
  elapsedMs?: number
  quote?: Id
}

export type HistoryMessage = NonSystemHistoryMessage | SystemHistoryMessage

export type HistoryLookupMessage = {
  id: Id
  role: Role
  time: ISODate
  content: string
  score: number
}

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
}

type UserInputSystem = {
  id: Id
  role: 'system'
  visibility: MessageVisibility
  text: string
  createdAt: ISODate
  focusId: FocusId
  quote?: Id
}

export type UserInput = UserInputUser | UserInputSystem

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export type TaskCancelSource = 'user' | 'deferred' | 'system'
export type TaskResultStatus = Extract<
  TaskStatus,
  'succeeded' | 'failed' | 'canceled'
>
export type WorkerProfile = 'worker'

export type TemplatePriority = 'high' | 'normal' | 'low'
export type TemplateSource = 'user_request' | 'agent_auto' | 'retry_decision'
export type TaskTemplateStatus = 'active' | 'blocked' | 'done'
export type TaskTemplateDoneReason = 'canceled' | 'completed' | 'exhausted'
export type TaskTemplateTriggerMode = 'cron' | 'scheduled_at' | 'on_idle'
export type FocusStatus = 'active' | 'idle' | 'done' | 'archived'

export type TaskCancelMeta = z.infer<typeof taskCancelSchema>
export type TaskResult = z.infer<typeof taskResultSchema>
export type Task = z.infer<typeof taskSchema>
export type TaskTemplateTrigger = z.infer<typeof taskTemplateTriggerSchema>
export type TaskTemplate = z.infer<typeof taskTemplateSchema>
export type FocusMeta = z.infer<typeof focusMetaSchema>
export type FocusContext = z.infer<typeof focusContextSchema>

export type JsonPacket<TPayload> = {
  id: string
  createdAt: string
  payload: TPayload
}

export type ManagerWakeProfile =
  | 'user_input'
  | 'task_result'
  | 'trigger'
  | 'idle'
  | 'mixed'

export type ManagerEnv = {
  lastUser?: {
    clientLocale?: string
    clientTimeZone?: string
    clientOffsetMinutes?: number
    clientNowIso?: string
  }
  wakeProfile?: ManagerWakeProfile
}

export type ManagerActionFeedback = {
  action: string
  error: string
  hint: string
  attempted?: string
}
