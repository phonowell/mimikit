import type { Id, ISODate } from './common.js'
import type { TokenUsage } from './usage.js'

export type TaskType = 'oneshot'
export type TriggerType = 'recurring' | 'scheduled' | 'conditional'

export type Condition =
  | { type: 'file_changed'; params: { path: string; fireOnInit?: boolean } }
  | { type: 'task_done'; params: { taskId: Id } }
  | { type: 'task_failed'; params: { taskId: Id } }
  | { type: 'file_exists'; params: { path: string } }
  | { type: 'llm_eval'; params: { prompt: string } }
  | { type: 'and'; params: { conditions: Condition[] } }
  | { type: 'or'; params: { conditions: Condition[] } }

export type TriggerState = {
  lastTriggeredAt?: ISODate | null
  lastEvalAt?: ISODate | null
  lastSeenResultId?: Id | null
  lastMtime?: number | null
  initialized?: boolean
  runningAt?: ISODate | null
  lastStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string | null
  lastDurationMs?: number | null
  nextRunAt?: ISODate | null
}

export type TriggerSchedule =
  | { interval: number; lastRunAt?: ISODate | null; nextRunAt?: ISODate | null }
  | { runAt: ISODate }

export type Trigger = {
  schemaVersion?: number
  id: Id
  type: TriggerType
  traceId?: Id
  parentTaskId?: Id
  prompt: string
  priority: number
  createdAt: ISODate
  timeout?: number | null
  schedule?: TriggerSchedule
  condition?: Condition
  cooldown?: number
  state?: TriggerState
}

export type Task = {
  schemaVersion?: number
  id: Id
  type: TaskType
  traceId?: Id
  parentTaskId?: Id
  prompt: string
  summary?: string
  priority: number
  createdAt: ISODate
  attempts: number
  timeout?: number | null
  deferUntil?: ISODate | null
  sourceTriggerId?: Id
  triggeredAt?: ISODate
}

export type PlannerTaskSpec = {
  id?: Id
  type?: TaskType
  prompt: string
  summary?: string
  priority?: number
  timeout?: number | null
  deferUntil?: ISODate | null
  traceId?: Id
  parentTaskId?: Id
  sourceTriggerId?: Id
  triggeredAt?: ISODate
}

export type PlannerTriggerSpec = {
  id?: Id
  type: TriggerType
  prompt: string
  priority?: number
  timeout?: number | null
  schedule?: TriggerSchedule
  condition?: Condition
  cooldown?: number
  state?: TriggerState
  traceId?: Id
  parentTaskId?: Id
}

export type PlannerResult = {
  schemaVersion?: number
  id: Id
  status: 'done' | 'needs_input' | 'failed'
  tasks?: PlannerTaskSpec[]
  triggers?: PlannerTriggerSpec[]
  question?: string
  options?: string[]
  default?: string
  error?: string
  attempts: number
  traceId?: Id
  completedAt: ISODate
  summary?: string
  durationMs?: number
  usage?: TokenUsage
}

export type WorkerResult = {
  schemaVersion?: number
  id: Id
  status: 'done' | 'failed'
  resultType: 'text' | 'code_change' | 'analysis' | 'summary'
  result: unknown
  error?: string
  failureReason?: 'timeout' | 'error' | 'killed'
  attempts: number
  traceId?: Id
  sourceTriggerId?: Id
  startedAt?: ISODate
  completedAt: ISODate
  durationMs?: number
  usage?: TokenUsage
  task?: {
    prompt: string
    summary?: string
    priority: number
    createdAt: ISODate
    timeout?: number | null
    traceId?: Id
    parentTaskId?: Id
    sourceTriggerId?: Id
    triggeredAt?: ISODate
  }
}

export type TaskStatus = {
  schemaVersion?: number
  id: Id
  status: 'done' | 'failed' | 'needs_input'
  role?: 'planner' | 'worker'
  completedAt: ISODate
  resultId: Id
  summary?: string
  durationMs?: number
  usage?: TokenUsage
  sourceTriggerId?: Id
  failureReason?: 'timeout' | 'error' | 'killed'
  traceId?: Id
}
