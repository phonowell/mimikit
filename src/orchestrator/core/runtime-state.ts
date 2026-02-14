import type { AppConfig } from '../../config.js'
import type { StatePaths } from '../../fs/paths.js'
import type {
  CronJob,
  ISODate,
  Task,
  TokenUsage,
  UserInput,
} from '../../types/index.js'
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

export type FocusState = {
  intent?: string
  activeTaskIds?: string[]
  topic?: string
}

export type UiAgentStream = {
  id: string
  role: 'assistant'
  text: string
  usage?: TokenUsage
  createdAt: ISODate
  updatedAt: ISODate
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
  focusState?: FocusState
  uiStream: UiAgentStream | null
  runningControllers: Map<string, AbortController>
  workerQueue: PQueue
  workerSignalController: AbortController
  uiSignalController?: AbortController
  lastUserMeta?: UserMeta
  lastEvolverRunAt?: number
}
