import { z } from 'zod'

import {
  cronJobSchema,
  focusContextSchema,
  focusMetaSchema,
  idleIntentSchema,
  intentTriggerPolicySchema,
  intentTriggerStateSchema,
  taskCancelSchema,
  taskResultSchema,
  taskSchema,
} from '../storage/runtime-snapshot-schema.js'

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
export type TaskResultStatus = Extract<TaskStatus, 'succeeded' | 'failed' | 'canceled'>
export type WorkerProfile = 'worker'

export type IntentPriority = 'high' | 'normal' | 'low'
export type IdleIntentStatus = 'pending' | 'blocked' | 'done'
export type IntentSource = 'user_request' | 'agent_auto' | 'retry_decision'
export type IntentTriggerMode = 'one_shot' | 'on_idle'
export type FocusStatus = 'active' | 'idle' | 'done' | 'archived'

export type TaskCancelMeta = z.infer<typeof taskCancelSchema>
export type TaskResult = z.infer<typeof taskResultSchema>
export type Task = z.infer<typeof taskSchema>
export type IdleIntentTriggerPolicy = z.infer<typeof intentTriggerPolicySchema>
export type IdleIntentTriggerState = z.infer<typeof intentTriggerStateSchema>
export type FocusMeta = z.infer<typeof focusMetaSchema>
export type FocusContext = z.infer<typeof focusContextSchema>
export type IdleIntent = z.infer<typeof idleIntentSchema>
export type CronJob = z.infer<typeof cronJobSchema>

export type JsonPacket<TPayload> = {
  id: string
  createdAt: string
  payload: TPayload
}

export type CronJobDisabledReason = 'canceled' | 'completed'

export type ManagerWakeProfile =
  | 'user_input'
  | 'task_result'
  | 'cron'
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
