import type {
  focusContextSchema,
  pendingUserChoiceSchema,
  focusMetaSchema,
  taskCancelSchema,
  taskResultSchema,
  taskSchema,
  taskPlanSchema,
  taskPlanTriggerSchema,
  userChoiceOptionSchema,
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
  source?: string
  platform?: string
  qqOpenid?: string
  qqMessageId?: string
  qqEventId?: string
  qqTimestamp?: ISODate
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
export type PlanPriority = 'high' | 'normal' | 'low'
export type PlanSource = 'user_request' | 'agent_auto' | 'retry_decision'
export type TaskPlanStatus = 'active' | 'blocked' | 'done'
export type TaskPlanDoneReason = 'canceled' | 'completed' | 'exhausted'
export type TaskPlanTriggerMode =
  | 'cron'
  | 'scheduled_at'
  | 'on_idle'
  | 'on_worker_slot_freed'
export type FocusStatus = 'active' | 'idle' | 'done' | 'archived'
export type TaskCancelMeta = z.infer<typeof taskCancelSchema>
export type TaskResult = z.infer<typeof taskResultSchema>
export type Task = z.infer<typeof taskSchema>
export type TaskPlanTrigger = z.infer<typeof taskPlanTriggerSchema>
export type TaskPlan = z.infer<typeof taskPlanSchema>
export type FocusMeta = z.infer<typeof focusMetaSchema>
export type FocusContext = z.infer<typeof focusContextSchema>
export type UserChoiceOption = z.infer<typeof userChoiceOptionSchema>
export type PendingUserChoice = z.infer<typeof pendingUserChoiceSchema>
export type UserChoiceSelectionSource = 'user' | 'timeout'
export type JsonPacket<TPayload> = {
  id: string
  createdAt: string
  payload: TPayload
}
export type ManagerWakeProfile =
  | 'user_input'
  | 'task_result'
  | 'trigger'
  | 'capacity'
  | 'idle'
  | 'mixed'
export type ManagerEnv = {
  lastUser?: {
    source?: string
    platform?: string
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
