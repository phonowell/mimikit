import type { AppConfig } from '../../config.js'
import type { StatePaths } from '../../fs/paths.js'
import type { TaskResultNotifier } from '../../notify/node-notifier.js'
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

export type UiAgentStream = {
  id: string
  role: 'agent'
  text: string
  usage?: TokenUsage
  createdAt: ISODate
  updatedAt: ISODate
}

export type RuntimeState = {
  runtimeId: string
  config: AppConfig
  paths: StatePaths
  stopped: boolean
  managerRunning: boolean
  managerSignalController: AbortController
  managerWakePending: boolean
  lastManagerActivityAtMs: number
  lastWorkerActivityAtMs: number
  inflightInputs: PendingUserInput[]
  queues: {
    inputsCursor: number
    resultsCursor: number
  }
  tasks: Task[]
  cronJobs: CronJob[]
  managerTurn: number
  plannerSessionId?: string
  uiStream: UiAgentStream | null
  runningControllers: Map<string, AbortController>
  createTaskDebounce: Map<string, number>
  workerQueue: PQueue
  workerSignalController: AbortController
  uiSignalController?: AbortController
  lastUserMeta?: UserMeta
  taskResultNotifier: TaskResultNotifier
}
