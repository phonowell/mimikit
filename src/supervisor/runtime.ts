import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type { Task, TaskResult, UserInput } from '../types/index.js'

export type PendingUserInput = UserInput

export type UserMeta = {
  source?: string
  remote?: string
  userAgent?: string
  language?: string
  clientLocale?: string
  clientTimeZone?: string
  clientOffsetMinutes?: number
  clientNowIso?: string
}

export type RuntimeState = {
  config: SupervisorConfig
  paths: StatePaths
  stopped: boolean
  managerRunning: boolean
  pendingInputs: PendingUserInput[]
  pendingResults: TaskResult[]
  tasks: Task[]
  runningWorkers: Set<string>
  runningControllers: Map<string, AbortController>
  lastUserMeta?: UserMeta
}

export type RuntimeQueues = Pick<
  RuntimeState,
  'pendingInputs' | 'pendingResults'
>
