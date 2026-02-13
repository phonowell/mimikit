import type { AppConfig } from '../../config.js'
import type { StatePaths } from '../../fs/paths.js'
import type { CronJob, Task, UserInput } from '../../types/index.js'
import type PQueue from 'p-queue'

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
  config: AppConfig
  paths: StatePaths
  stopped: boolean
  managerRunning: boolean
  managerSignalController: AbortController
  inflightInputs: PendingUserInput[]
  queues: {
    inputsCursor: number
    resultsCursor: number
  }
  tasks: Task[]
  cronJobs: CronJob[]
  runningControllers: Map<string, AbortController>
  workerQueue: PQueue
  workerSignalController: AbortController
  uiSignalController?: AbortController
  lastUserMeta?: UserMeta
  lastEvolverRunAt?: number
}
