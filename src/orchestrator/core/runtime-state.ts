import type { AppConfig } from '../../config.js'
import type { StatePaths } from '../../fs/paths.js'
import type {
  FocusContext,
  FocusId,
  FocusMeta,
  ISODate,
  PendingUserChoice,
  Task,
  TaskPlan,
  UserInput,
} from '../../types/index.js'
import type PQueue from 'p-queue'

export type PendingUserInput = UserInput

export type UserMeta = {
  source?: string
  platform?: string
  channel?: string
  remote?: string
  userAgent?: string
  language?: string
  clientLocale?: string
  clientTimeZone?: string
  clientOffsetMinutes?: number
  clientNowIso?: string
  telegramChatId?: string
  telegramMessageId?: string
  telegramUpdateId?: string
  telegramTimestamp?: string
  feishuChatId?: string
  feishuMessageId?: string
  feishuEventId?: string
  feishuTimestamp?: string
}

export type UiWakeKind = 'snapshot' | 'messages' | 'tasks'

export type ExitRequest = {
  code: number
  reason: string
}

export type RuntimeMemoryRefreshState = {
  lastCompletedTurn: number
  lastProcessedInputsCursor: number
  lastProcessedResultsCursor: number
  lastProcessedPlanUpdatedAt?: ISODate
  lastRunAt?: ISODate
  running: boolean
  pending: boolean
}

export type ManagerFocusCompressedContext = {
  focusId: FocusId
  summary: string
  updatedAt: ISODate
  firstKeptEntryId?: string | undefined
  details?:
    | {
        historyFrom?: ISODate | undefined
        historyTo?: ISODate | undefined
        messageCount?: number | undefined
        taskIds?: string[] | undefined
        archivePaths?: string[] | undefined
      }
    | undefined
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
  taskPlans: TaskPlan[]
  focuses: FocusMeta[]
  focusContexts: FocusContext[]
  activeFocusIds: FocusId[]
  managerTurn: number
  memoryRefresh: RuntimeMemoryRefreshState
  managerFocusCompressedContexts: ManagerFocusCompressedContext[]
  managerCompressedContext?: string
  runningControllers: Map<string, AbortController>
  createTaskDebounce: Map<string, number>
  workerQueue: PQueue
  workerSignalController: AbortController
  uiWakeVersion: number
  uiWakeEvents: Map<number, UiWakeKind>
  uiSignalControllers: Set<AbortController>
  pendingUserChoice: PendingUserChoice | null
  lastUserMeta?: UserMeta
  requestExit?: (request: ExitRequest) => void
}
