import type {
  FocusId,
  ISODate,
  PlanPriority,
  TokenUsage,
  WorkerProfile,
} from './base.js'
import type {
  FocusStatus,
  TaskCancelSource,
  TaskPlanStatus,
  TaskResultOutcome,
  TaskResultStatus,
  TaskResultStopReason,
  TaskStatus,
  WorkerProvider,
} from './runtime-domain.js'
import type { TaskGitExecution } from './task-git-types.js'
import type { TaskResultHandoff } from './task-handoff-types.js'

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
  completedAt: ISODate
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
  git?: TaskGitExecution | undefined
  contract?: TaskContract | undefined
  focusId: FocusId
  profile: WorkerProfile
  provider: WorkerProvider
  status: TaskStatus
  createdAt: ISODate
  startedAt?: ISODate | undefined
  pausedAt?: ISODate | undefined
  completedAt?: ISODate | undefined
  durationMs?: number | undefined
  attempts?: number | undefined
  usage?: TokenUsage | undefined
  sessionId?: string | undefined
  sessionState?: 'reusable' | 'discarded' | undefined
  sessionUpdatedAt?: ISODate | undefined
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
  scheduledAt: ISODate
}

type TaskPlanTriggerOnWorkerSlotFreed = {
  mode: 'on_worker_slot_freed'
}

export type TaskPlanTrigger =
  | TaskPlanTriggerCron
  | TaskPlanTriggerScheduledAt
  | TaskPlanTriggerOnWorkerSlotFreed

export type TaskPlanEnqueueTaskEffect = {
  kind: 'enqueue_task'
  taskTemplate: {
    title: string
    prompt: string
    cwd: string
    branch?: string | undefined
    contract: TaskContract
  }
}

export type TaskPlanWakeManagerEffect = {
  kind: 'wake_manager'
  reason: 'scheduled_review' | 'capacity_retry' | 'follow_up'
}

export type TaskPlanEffect =
  | TaskPlanEnqueueTaskEffect
  | TaskPlanWakeManagerEffect

export type TaskPlanRuntime = {
  runCount: number
  lastTriggeredAt?: ISODate | undefined
  lastTaskId?: string | undefined
  closedAt?: ISODate | undefined
  doneReason?: 'canceled' | 'completed' | 'exhausted' | undefined
}

export type TaskPlan = {
  id: string
  title: string
  focusId: FocusId
  priority: PlanPriority
  status: TaskPlanStatus
  trigger: TaskPlanTrigger
  effect: TaskPlanEffect
  createdAt: ISODate
  updatedAt: ISODate
  maxRuns?: number | undefined
  runtime: TaskPlanRuntime
}

export type FocusMeta = {
  id: string
  title: string
  status: FocusStatus
  createdAt: ISODate
  updatedAt: ISODate
  lastActivityAt: ISODate
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
  createdAt: ISODate
  expiresAt?: ISODate | undefined
  focusId: FocusId
  effect?: PendingUserChoiceEffect | undefined
}
