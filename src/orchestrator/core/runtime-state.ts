import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { buildPaths, type StatePaths } from '../../fs/paths.js'
import { setDefaultLogPath } from '../../log/safe.js'

import type { RuntimeMemoryRefreshState } from '../../memory/refresh/state.js'
import type { RuntimeStartupInfo } from '../../shared/runtime-startup.js'
import type {
  FocusMeta,
  ManagerContextPacket,
  PendingUserChoice,
  Task,
  TaskPlan,
  TokenUsage,
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

export type ChannelTargets = {
  telegramChatId?: string
  feishuChatId?: string
}

export type UiWakeKind = 'snapshot' | 'messages' | 'tasks'

export type ExitRequest = {
  code: number
  reason: string
}

export type RuntimeSessionState = {
  stopped: boolean
  inflightInputs: PendingUserInput[]
  lastUserMeta?: UserMeta
  channelTargets: ChannelTargets
  restartScheduled: boolean
  pendingRestartReason?: string
  requestExit?: (request: ExitRequest) => void
}

export type RuntimeManagerState = {
  running: boolean
  signalController: AbortController
  runAbortController: AbortController
  wakePending: boolean
  lastActivityAtMs: number
  resultReplayReadyAtMs: number
  resultReplayFailureCount: number
  turn: number
  threadId?: string
  memoryRefresh: RuntimeMemoryRefreshState
  lastContextPacket?: ManagerContextPacket
  lastUsage?: TokenUsage
  usageTotal?: TokenUsage
}

export type RuntimeWorkerState = {
  lastActivityAtMs: number
  runningControllers: Map<string, AbortController>
  runningTaskLocks: Set<string>
  createTaskDebounce: Map<string, number>
  queue: PQueue
  signalController: AbortController
}

export type RuntimeUiState = {
  wakeVersion: number
  wakeEvents: Map<number, UiWakeKind>
  signalControllers: Set<AbortController>
  pendingUserChoices: PendingUserChoice[]
}

export type RuntimeState = {
  runtimeId: string
  startup: RuntimeStartupInfo
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
}

export const createRuntimeState = (
  config: AppConfig,
  options: {
    runtimeId: string
    startup: RuntimeStartupInfo
    onExitRequested?: (request: ExitRequest) => void
  },
): RuntimeState => {
  const paths = buildPaths(config.workDir)
  setDefaultLogPath(paths.log)
  const nowMs = Date.now()
  const memoryRefresh: RuntimeMemoryRefreshState = {
    lastCompletedTurn: 0,
    signalVersion: 0,
    lastProcessedSignalVersion: 0,
    running: false,
    pending: false,
  }
  return {
    runtimeId: options.runtimeId,
    startup: options.startup,
    config,
    paths,
    session: {
      stopped: false,
      inflightInputs: [],
      channelTargets: {},
      restartScheduled: false,
      ...(options.onExitRequested
        ? { requestExit: options.onExitRequested }
        : {}),
    },
    manager: {
      running: false,
      signalController: new AbortController(),
      runAbortController: new AbortController(),
      wakePending: false,
      lastActivityAtMs: nowMs,
      resultReplayReadyAtMs: 0,
      resultReplayFailureCount: 0,
      turn: 0,
      memoryRefresh,
    },
    worker: {
      lastActivityAtMs: nowMs,
      runningControllers: new Map(),
      runningTaskLocks: new Set(),
      createTaskDebounce: new Map(),
      queue: new PQueue({ concurrency: config.worker.maxConcurrent }),
      signalController: new AbortController(),
    },
    ui: {
      wakeVersion: 0,
      wakeEvents: new Map(),
      signalControllers: new Set(),
      pendingUserChoices: [],
    },
    queues: { inputsCursor: 0, resultsCursor: 0 },
    tasks: [],
    taskPlans: [],
    focuses: [],
  }
}
