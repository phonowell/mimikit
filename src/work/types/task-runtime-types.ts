import type { TaskGitExecution } from './task-git-types.js'
import type { TaskResultHandoff } from './task-handoff-types.js'
import type {
  FocusId,
  ISODate,
  PlanPriority,
  TokenUsage,
  WorkerProfile,
} from '../../foundation/types/base.js'
import type {
  FocusStatus,
  TaskCancelSource,
  TaskPlanStatus,
  TaskResultOutcome,
  TaskResultStatus,
  TaskResultStopReason,
  TaskStatus,
  WorkerProvider,
} from '../../foundation/types/runtime-domain.js'

export const TASK_RESOURCE_MODE_VALUES = ['read', 'write'] as const

export type TaskResourceMode = (typeof TASK_RESOURCE_MODE_VALUES)[number]

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
  status: 'done' | 'failed'
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
  traceRef?: string | undefined
  providerCallId?: string | undefined
  attempt?: number | undefined
  profile?: WorkerProfile | undefined
  provider?: WorkerProvider | undefined
  cancel?: TaskCancelMeta | undefined
  handoff?: TaskResultHandoff | undefined
  evidence?: TaskEvidence | undefined
}

export type Task = {
  id: string
  fingerprint: string
  semanticKey: string
  executionSpecId: string
  contract?: TaskContract | undefined
  title: string
  cwd: string
  resourceMode?: TaskResourceMode | undefined
  repoKey?: string | undefined
  branch?: string | undefined
  git?: TaskGitExecution | undefined
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
  resumeInstruction?: string | undefined
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
  taskKey: string
  taskContract?: TaskContract | undefined
  taskTemplate: {
    title: string
    executionSpecId: string
    cwd: string
    resourceMode?: TaskResourceMode | undefined
    useWorktree?: boolean | undefined
    branch?: string | undefined
  }
}

export type TaskPlanEffect = TaskPlanEnqueueTaskEffect

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
