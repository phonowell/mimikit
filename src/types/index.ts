import type {
  focusDigestSchema,
  focusMetaSchema,
  managerContextPacketSchema,
  managerPacketModeSchema,
  managerPacketSectionSchema,
  pendingUserChoiceEffectSchema,
  pendingUserChoiceSchema,
  taskCancelSchema,
  taskPlanSchema,
  taskPlanTriggerSchema,
  taskResultSchema,
  taskSchema,
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
export type TaskArchiveLookupMessage = {
  taskId: string
  status: TaskResultStatus
  completedAt: ISODate
  archivePath: string
  score: number
  title?: string | undefined
  snippet?: string | undefined
}
export type QueryContextScope =
  | 'history'
  | 'tasks'
  | 'focus'
  | 'plans'
  | 'generated_index'
  | 'task_archives'
export type QueryLookupHistoryItem = {
  ref: string
  id: string
  role: Role
  time: ISODate
  score: number
  focusId: FocusId
  snippet: string
}
export type QueryLookupTaskItem = {
  ref: string
  id: string
  status: TaskStatus
  focusId: FocusId
  createdAt: ISODate
  score: number
  title: string
  snippet: string
}
export type QueryLookupFocusItem = {
  ref: string
  id: string
  status: FocusStatus
  updatedAt: ISODate
  score: number
  title: string
  summary?: string | undefined
}
export type QueryLookupPlanItem = {
  ref: string
  id: string
  status: TaskPlanStatus
  triggerMode: TaskPlanTriggerMode
  updatedAt: ISODate
  score: number
  title: string
  snippet: string
}
export type QueryLookupTaskArchiveItem = {
  ref: string
  taskId: string
  status: TaskResultStatus
  completedAt: ISODate
  archivePath: string
  score: number
  title?: string | undefined
  snippet?: string | undefined
}
export type QueryLookupGeneratedIndexItem = {
  ref: string
  path: string
  updatedAt: ISODate
  size: number
  score: number
  snippet?: string | undefined
}
export type QueryLookupScopeResult<TItem> = {
  items: TItem[]
  truncated: boolean
  nextOffset?: number | undefined
}
export type QueryLookupResults = {
  history?: QueryLookupScopeResult<QueryLookupHistoryItem>
  tasks?: QueryLookupScopeResult<QueryLookupTaskItem>
  focus?: QueryLookupScopeResult<QueryLookupFocusItem>
  plans?: QueryLookupScopeResult<QueryLookupPlanItem>
  generated_index?: QueryLookupScopeResult<QueryLookupGeneratedIndexItem>
  task_archives?: QueryLookupScopeResult<QueryLookupTaskArchiveItem>
}
export type QueryLookupMessage = {
  request: {
    query: string
  }
  results: QueryLookupResults
  meta: {
    truncated: boolean
    usedBytes: number
    maxBytes: number
  }
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
export type TaskStatus =
  | 'pending'
  | 'paused'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
export type TaskCancelSource = 'user' | 'deferred' | 'system'
export type TaskResultStatus =
  | Extract<TaskStatus, 'succeeded' | 'failed' | 'canceled'>
  | 'partial'
export type TaskResultOutcome = 'completed' | 'partial' | 'blocked'
export type TaskResultStopReason =
  | 'completed'
  | 'budget_exhausted'
  | 'guard_rejected'
  | 'input_required'
  | 'failed'
  | 'canceled'
export type TaskResultHandoffArtifact = {
  path: string
  kind?: string | undefined
  note?: string | undefined
}
export type TaskResultHandoffEvidence = {
  type: 'task_archive' | 'file' | 'history'
  ref: string
  note?: string | undefined
}
export type TaskResultHandoff = {
  goal?: string | undefined
  summary?: string | undefined
  decisions?: string[] | undefined
  nextSteps?: string[] | undefined
  risks?: string[] | undefined
  artifacts?: TaskResultHandoffArtifact[] | undefined
  evidence?: TaskResultHandoffEvidence[] | undefined
}
export type TaskContract = {
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string | undefined
  contextRefs?: string[] | undefined
}
export type TaskEvidenceAcceptance = {
  criterion: string
  met: boolean
  note?: string | undefined
}
export type TaskEvidence = {
  status: 'done' | 'partial' | 'failed'
  contractGoal: string
  acceptanceChecks: TaskEvidenceAcceptance[]
  stateDelta: {
    taskStatusFrom?: TaskStatus | undefined
    taskStatusTo: TaskStatus
    archivePath?: string | undefined
  }
  nextSteps?: string[] | undefined
  risks?: string[] | undefined
}
export type WorkerProvider = 'codex' | 'opencode'
export type WorkerProfile = 'worker'
export type ProviderCapability = 'low' | 'medium' | 'high'
export type ProviderBilling = 'free' | 'low' | 'medium' | 'high'
export type PlanPriority = 'high' | 'normal' | 'low'
export type PlanSource = 'user_request' | 'agent_auto' | 'retry_decision'
export type TaskPlanStatus = 'active' | 'blocked' | 'done'
export type TaskPlanTriggerMode =
  | 'cron'
  | 'scheduled_at'
  | 'on_worker_slot_freed'
export type FocusStatus = 'active' | 'idle' | 'done' | 'archived'
export type TaskCancelMeta = z.infer<typeof taskCancelSchema>
export type TaskResult = z.infer<typeof taskResultSchema>
export type Task = z.infer<typeof taskSchema>
export type TaskPlanTrigger = z.infer<typeof taskPlanTriggerSchema>
export type TaskPlan = z.infer<typeof taskPlanSchema>
export type FocusMeta = z.infer<typeof focusMetaSchema>
export type FocusDigest = z.infer<typeof focusDigestSchema>
export type UserChoiceOption = z.infer<typeof userChoiceOptionSchema>
export type PendingUserChoiceEffect = z.infer<
  typeof pendingUserChoiceEffectSchema
>
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
  | 'mixed'
export type ManagerPacketMode = z.infer<typeof managerPacketModeSchema>
export type ManagerPacketSection = z.infer<typeof managerPacketSectionSchema>
export type ManagerContextPacket = z.infer<typeof managerContextPacketSchema>
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
  workerSlots?: {
    maxSlots: number
    occupiedSlots: number
    availableSlots: number
  }
  workerProviders?: Array<{
    provider: WorkerProvider
    model: string
    capability: ProviderCapability
    billing: ProviderBilling
  }>
}
export type ManagerActionFeedback = {
  action: string
  error: string
  hint: string
  attempted?: string
}
