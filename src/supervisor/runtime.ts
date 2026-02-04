import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type { Task, TaskResult } from '../types/tasks.js'

export type PendingUserInput = {
  id: string
  text: string
  createdAt: string
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
  lastUserInputAtMs?: number
  lastUserMeta?: {
    source?: string
    remote?: string
    userAgent?: string
    language?: string
    clientLocale?: string
    clientTimeZone?: string
    clientOffsetMinutes?: number
    clientNowIso?: string
  }
}
