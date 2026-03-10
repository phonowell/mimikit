import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { buildPaths, type StatePaths } from '../../fs/paths.js'
import { setDefaultLogPath } from '../../log/safe.js'
import { newId } from '../../shared/utils.js'

import type { RuntimeMemoryRefreshState } from '../../memory/refresh/state.js'
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

export type RuntimeSessionState = {
  stopped: boolean
  inflightInputs: PendingUserInput[]
  lastUserMeta?: UserMeta
  requestExit?: (request: ExitRequest) => void
}

export type RuntimeManagerState = {
  running: boolean
  signalController: AbortController
  wakePending: boolean
  lastActivityAtMs: number
  turn: number
  threadId?: string
  memoryRefresh: RuntimeMemoryRefreshState
  focusCompressedContexts: ManagerFocusCompressedContext[]
  compressedContext: string
}

export type RuntimeWorkerState = {
  lastActivityAtMs: number
  runningControllers: Map<string, AbortController>
  createTaskDebounce: Map<string, number>
  queue: PQueue
  signalController: AbortController
}

export type RuntimeUiState = {
  wakeVersion: number
  wakeEvents: Map<number, UiWakeKind>
  signalControllers: Set<AbortController>
  pendingUserChoice: PendingUserChoice | null
}

export type RuntimeState = {
  runtimeId: string
  config: AppConfig
  paths: StatePaths
  session: RuntimeSessionState
  manager: RuntimeManagerState
  worker: RuntimeWorkerState
  ui: RuntimeUiState
  queues: {
    inputsCursor: number
    resultsCursor: number
  }
  tasks: Task[]
  taskPlans: TaskPlan[]
  focuses: FocusMeta[]
  focusContexts: FocusContext[]
}

export const createRuntimeState = (
  config: AppConfig,
  options: {
    onExitRequested?: (request: ExitRequest) => void
  } = {},
): RuntimeState => {
  const paths = buildPaths(config.workDir)
  setDefaultLogPath(paths.log)
  const nowMs = Date.now()
  const memoryRefresh: RuntimeMemoryRefreshState = {
    lastCompletedTurn: 0,
    lastProcessedInputsCursor: 0,
    lastProcessedResultsCursor: 0,
    running: false,
    pending: false,
  }
  return {
    runtimeId: `runtime-${newId()}`,
    config,
    paths,
    session: {
      stopped: false,
      inflightInputs: [],
      ...(options.onExitRequested
        ? { requestExit: options.onExitRequested }
        : {}),
    },
    manager: {
      running: false,
      signalController: new AbortController(),
      wakePending: false,
      lastActivityAtMs: nowMs,
      turn: 0,
      memoryRefresh,
      focusCompressedContexts: [],
      compressedContext: '',
    },
    worker: {
      lastActivityAtMs: nowMs,
      runningControllers: new Map(),
      createTaskDebounce: new Map(),
      queue: new PQueue({ concurrency: config.worker.maxConcurrent }),
      signalController: new AbortController(),
    },
    ui: {
      wakeVersion: 0,
      wakeEvents: new Map(),
      signalControllers: new Set(),
      pendingUserChoice: null,
    },
    queues: { inputsCursor: 0, resultsCursor: 0 },
    tasks: [],
    taskPlans: [],
    focuses: [],
    focusContexts: [],
  }
}
