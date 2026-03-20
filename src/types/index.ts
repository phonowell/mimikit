import type {
  FocusStatus,
  ManagerWakeProfile,
  TaskCancelSource,
  TaskPlanStatus,
  TaskPlanTriggerMode,
  TaskResultOutcome,
  TaskResultStatus,
  TaskResultStopReason,
  TaskStatus,
  WorkerProvider,
} from './runtime-domain.js'

export type {
  FocusStatus,
  ManagerWakeProfile,
  TaskCancelSource,
  TaskPlanStatus,
  TaskPlanTriggerMode,
  TaskResultOutcome,
  TaskResultStatus,
  TaskResultStopReason,
  TaskStatus,
  WorkerProvider,
} from './runtime-domain.js'
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
export type WorkerProfile = 'worker'
export type ProviderCapability = 'low' | 'medium' | 'high'
export type ProviderBilling = 'free' | 'low' | 'medium' | 'high'
export type PlanPriority = 'high' | 'normal' | 'low'
export type PlanSource = 'user_request' | 'agent_auto' | 'retry_decision'
export type TaskCancelMeta = {
  source: TaskCancelSource
  reason?: string | undefined
}
export type TaskResult = {
  taskId: string
  status: TaskResultStatus
  ok: boolean
  output: string
  durationMs: number
  completedAt: string
  taskStatus?: TaskStatus | undefined
  outcome?: TaskResultOutcome | undefined
  stopReason?: TaskResultStopReason | undefined
  usage?: TokenUsage | undefined
  title?: string | undefined
  archivePath?: string | undefined
  profile?: WorkerProfile | undefined
  provider?: WorkerProvider | undefined
  cancel?: TaskCancelMeta | undefined
  handoff?: TaskResultHandoff | undefined
  evidence?: TaskEvidence | undefined
}
export type Task = {
  id: string
  fingerprint: string
  prompt: string
  title: string
  cwd: string
  repoKey?: string | undefined
  branch?: string | undefined
  contract?: TaskContract | undefined
  focusId: string
  cron?: string | undefined
  scheduledAt?: string | undefined
  profile: WorkerProfile
  provider: WorkerProvider
  status: TaskStatus
  createdAt: string
  startedAt?: string | undefined
  pausedAt?: string | undefined
  completedAt?: string | undefined
  durationMs?: number | undefined
  attempts?: number | undefined
  usage?: TokenUsage | undefined
  sessionId?: string | undefined
  sessionState?: 'reusable' | 'discarded' | undefined
  sessionUpdatedAt?: string | undefined
  archivePath?: string | undefined
  cancel?: TaskCancelMeta | undefined
  result?: TaskResult | undefined
}
type TaskPlanTriggerCron = {
  mode: 'cron'
  cron: string
  timeZone?: string | undefined
}
type TaskPlanTriggerScheduledAt = {
  mode: 'scheduled_at'
  scheduledAt: string
}
type TaskPlanTriggerOnWorkerSlotFreed = {
  mode: 'on_worker_slot_freed'
}
export type TaskPlanTrigger =
  | TaskPlanTriggerCron
  | TaskPlanTriggerScheduledAt
  | TaskPlanTriggerOnWorkerSlotFreed
export type TaskPlan = {
  id: string
  prompt: string
  title: string
  focusId: string
  profile: WorkerProfile
  priority: PlanPriority
  source: PlanSource
  status: TaskPlanStatus
  trigger: TaskPlanTrigger
  createdAt: string
  updatedAt: string
  runCount: number
  maxRuns?: number | undefined
  lastTriggeredAt?: string | undefined
  lastCompletedAt?: string | undefined
  lastTaskId?: string | undefined
  archivedAt?: string | undefined
  doneReason?: 'canceled' | 'completed' | 'exhausted' | undefined
}
export type FocusMeta = {
  id: string
  title: string
  status: FocusStatus
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  summary?: string | undefined
  openItems?: string[] | undefined
}
export type UserChoiceOption = {
  id: string
  label: string
  reason: string
}
export type PendingUserChoiceEffect = {
  type: 'resume_task'
  taskId: string
  optionId: string
  reason?: string | undefined
}
export type PendingUserChoice = {
  id: string
  question: string
  options: UserChoiceOption[]
  defaultOptionId: string
  createdAt: string
  expiresAt?: string | undefined
  focusId: string
  effect?: PendingUserChoiceEffect | undefined
}
export type UserChoiceSelectionSource = 'user' | 'timeout'
export type JsonPacket<TPayload> = {
  id: string
  createdAt: string
  payload: TPayload
}
export type ManagerPacketMode = 'minimal' | 'standard' | 'expanded'
export type ManagerPacketSection =
  | 'packet_summary'
  | 'environment'
  | 'focus_list'
  | 'working_focuses'
  | 'remembered_memory'
  | 'memory'
  | 'tasks'
  | 'plans'
  | 'inputs'
  | 'batch_results'
  | 'recent_history'
  | 'history_lookup'
  | 'query_lookup'
  | 'file_lookup'
  | 'action_feedback'
type ManagerSectionDigest = {
  section: 'recent_history' | 'query_lookup' | 'batch_results'
  mode: 'digest'
  sourceBytes: number
  digestBytes: number
  sourceItems: number
  digestItems: number
  sourceRefCount: number
}
export type ManagerContextPacket = {
  id: string
  createdAt: string
  wakeProfile: ManagerWakeProfile
  mode: ManagerPacketMode
  counts: {
    inputs: number
    results: number
    tasks: number
    plans: number
    workingFocuses: number
  }
  latestUserInput?:
    | {
        id: string
        focusId: FocusId
        text: string
      }
    | undefined
  latestResult?:
    | {
        taskId: string
        status: TaskResultStatus
        focusId?: FocusId | undefined
        summary?: string | undefined
        stopReason?: string | undefined
        archivePath?: string | undefined
      }
    | undefined
  activeTaskIds?: string[] | undefined
  activePlanIds?: string[] | undefined
  workingFocusIds?: FocusId[] | undefined
  sectionDigests?: ManagerSectionDigest[] | undefined
  includedSections: ManagerPacketSection[]
  prunedSections: ManagerPacketSection[]
}
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
