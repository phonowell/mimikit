import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { buildPaths } from '../../fs/paths.js'
import { bestEffort, logSafeError, setDefaultLogPath } from '../../log/safe.js'
import { createDefaultMemoryRefreshState } from '../../memory/refresh/state.js'
import { newId } from '../../shared/utils.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { deleteTask } from '../../worker/delete-task.js'
import { getTaskLiveOutputById } from '../../worker/live-output.js'
import { pauseTask } from '../../worker/pause-task.js'
import { resumeTask } from '../../worker/resume-task.js'
import { type ChatMessage } from '../read-model/chat-view.js'
import { buildFocusViews } from '../read-model/focus-view.js'
import { sortTaskPlansForView } from '../read-model/plan-select.js'
import { buildTaskViews } from '../read-model/task-view.js'

import {
  computeOrchestratorStatus,
  type OrchestratorStatus,
} from './orchestrator-helpers.js'
import {
  addUserInput,
  deleteChatMessage,
  type DeleteChatMessageResult,
  getChatHistory,
  getChatMessages,
  persistStopSnapshot,
  prepareStop,
  selectPendingUserChoiceFromUser,
  startOrchestratorRuntime,
  waitForManagerDrain,
} from './orchestrator-runtime-ops.js'
import { waitForUiSignal } from './signals.js'
import { clonePendingUserChoice } from './user-choice.js'

import type {
  ExitRequest,
  RuntimeState,
  UiWakeKind,
  UserMeta,
} from './runtime-state.js'
import type { SelectPendingUserChoiceResult } from './user-choice.js'
import type { Task, TaskPlan } from '../../types/index.js'

export type { OrchestratorStatus } from './orchestrator-helpers.js'

type OrchestratorOptions = {
  onExitRequested?: (request: ExitRequest) => void
}

const TELEGRAM_POLLING_RETRY_DELAY_MS = 10_000

export const isTelegramPollingConflictError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error)
  return (
    message.includes('telegram_polling_start_failed:409') ||
    (message.includes('conflict') && message.includes('getupdates'))
  )
}

export class Orchestrator {
  private runtime: RuntimeState
  private telegramStartPromise: Promise<void> | null = null
  private telegramRetryTimer: ReturnType<typeof setTimeout> | null = null
  private restartScheduled = false

  private scheduleRestart(
    reason: string,
  ): 'scheduled' | 'busy' | 'already_scheduled' {
    const status = this.getStatus()
    const canRestart =
      status.managerRunning === false &&
      status.activeTasks === 0 &&
      status.pendingTasks === 0
    if (!canRestart) return 'busy'
    if (this.restartScheduled) return 'already_scheduled'

    this.restartScheduled = true
    setTimeout(() => {
      void (async () => {
        await this.stopAndPersist()
        this.requestExit(75, reason)
      })()
    }, 100)
    return 'scheduled'
  }

  private async startTelegramPollingIfEnabled(): Promise<void> {
    if (!this.runtime.config.telegram.enabled) return
    const { startTelegramPolling } =
      await import('../../channels/telegram/index.js')
    await startTelegramPolling({
      config: this.runtime.config,
      logPath: this.runtime.paths.log,
      workDir: this.runtime.config.workDir,
      addUserInput: (text, meta, quote) => this.addUserInput(text, meta, quote),
      requestRestart: (reason) => this.scheduleRestart(reason),
    })
  }

  private clearTelegramRetryTimer(): void {
    if (!this.telegramRetryTimer) return
    clearTimeout(this.telegramRetryTimer)
    this.telegramRetryTimer = null
  }

  private scheduleTelegramPollingRetry(error: unknown): void {
    if (!isTelegramPollingConflictError(error)) return
    if (this.runtime.stopped || !this.runtime.config.telegram.enabled) return
    if (this.telegramRetryTimer) return
    this.telegramRetryTimer = setTimeout(() => {
      this.telegramRetryTimer = null
      this.ensureTelegramPollingStart()
    }, TELEGRAM_POLLING_RETRY_DELAY_MS)
  }

  private ensureTelegramPollingStart(): void {
    if (this.telegramStartPromise) return
    this.telegramStartPromise = (async () => {
      if (!this.runtime.config.telegram.enabled || this.runtime.stopped) return
      try {
        await this.startTelegramPollingIfEnabled()
      } catch (error) {
        await logSafeError('orchestrator:start_telegram_polling', error, {
          logPath: this.runtime.paths.log,
          ...(isTelegramPollingConflictError(error)
            ? { meta: { retryInMs: TELEGRAM_POLLING_RETRY_DELAY_MS } }
            : {}),
        })
        this.scheduleTelegramPollingRetry(error)
      }
    })()
      .then(async () => {
        if (!this.runtime.stopped) return
        await bestEffort(
          'orchestrator:stop_telegram_after_late_start',
          () => this.stopTelegramPollingIfEnabled(),
          { logPath: this.runtime.paths.log },
        )
      })
      .finally(() => {
        this.telegramStartPromise = null
      })
  }

  private async stopTelegramPollingIfEnabled(): Promise<void> {
    if (!this.runtime.config.telegram.enabled) return
    const { stopTelegramPolling } =
      await import('../../channels/telegram/index.js')
    await stopTelegramPolling({
      workDir: this.runtime.config.workDir,
      logPath: this.runtime.paths.log,
    })
  }

  constructor(config: AppConfig, options: OrchestratorOptions = {}) {
    const paths = buildPaths(config.workDir)
    setDefaultLogPath(paths.log)
    const nowMs = Date.now()
    this.runtime = {
      runtimeId: `runtime-${newId()}`,
      config,
      paths,
      stopped: false,
      managerRunning: false,
      managerSignalController: new AbortController(),
      managerWakePending: false,
      lastManagerActivityAtMs: nowMs,
      lastWorkerActivityAtMs: nowMs,
      inflightInputs: [],
      queues: { inputsCursor: 0, resultsCursor: 0 },
      tasks: [],
      taskPlans: [],
      focuses: [],
      focusContexts: [],
      activeFocusIds: [],
      managerTurn: 0,
      memoryRefresh: createDefaultMemoryRefreshState(),
      managerFocusCompressedContexts: [],
      runningControllers: new Map(),
      createTaskDebounce: new Map(),
      workerQueue: new PQueue({ concurrency: config.worker.maxConcurrent }),
      workerSignalController: new AbortController(),
      uiWakeVersion: 0,
      uiWakeEvents: new Map(),
      uiSignalControllers: new Set(),
      pendingUserChoice: null,
      ...(options.onExitRequested
        ? { requestExit: options.onExitRequested }
        : {}),
    }
  }

  async start() {
    await startOrchestratorRuntime(this.runtime)
    this.ensureTelegramPollingStart()
  }

  stop() {
    prepareStop(this.runtime)
    this.clearTelegramRetryTimer()
    void bestEffort(
      'orchestrator:stop_telegram_polling',
      () => this.stopTelegramPollingIfEnabled(),
      { logPath: this.runtime.paths.log },
    )
    void persistStopSnapshot(this.runtime)
  }

  async stopAndPersist(): Promise<void> {
    prepareStop(this.runtime)
    this.clearTelegramRetryTimer()
    await bestEffort(
      'orchestrator:stop_telegram_polling',
      () => this.stopTelegramPollingIfEnabled(),
      { logPath: this.runtime.paths.log },
    )
    await waitForManagerDrain(this.runtime)
    await persistStopSnapshot(this.runtime)
  }

  addUserInput(text: string, meta?: UserMeta, quote?: string): Promise<string> {
    return addUserInput(this.runtime, text, meta, quote)
  }

  deleteChatMessage(messageId: string): Promise<DeleteChatMessageResult> {
    return deleteChatMessage(this.runtime, messageId)
  }

  getChatHistory(limit = 50): Promise<ChatMessage[]> {
    return getChatHistory(this.runtime, limit)
  }

  getChatMessages(limit = 50, afterId?: string) {
    return getChatMessages(this.runtime, limit, afterId)
  }

  private buildTasksSnapshot(limit = 200) {
    const liveOutputByTaskId = getTaskLiveOutputById(this.runtime)
    return buildTaskViews(this.runtime.tasks, limit, {
      maxConcurrentWorkers: this.runtime.config.worker.maxConcurrent,
      runningTaskCount: this.runtime.runningControllers.size,
      ...(liveOutputByTaskId ? { liveOutputByTaskId } : {}),
    })
  }

  getTasks(limit = 200) {
    return this.buildTasksSnapshot(limit)
  }

  getPlans(limit = 200): { items: TaskPlan[] } {
    const items = sortTaskPlansForView(this.runtime.taskPlans)
      .slice(0, Math.max(0, limit))
      .map((item) => ({ ...item }))
    return { items }
  }

  getFocuses(limit = 200) {
    return buildFocusViews(
      this.runtime.focuses,
      this.runtime.focusContexts,
      this.runtime.activeFocusIds,
      limit,
      this.runtime.tasks,
    )
  }

  getWebUiSnapshot(messageLimit = 50, taskLimit = 200) {
    return (async () => ({
      status: this.getStatus(),
      messages: await getChatMessages(this.runtime, messageLimit),
      tasks: this.buildTasksSnapshot(taskLimit),
      plans: this.getPlans(taskLimit),
      focuses: this.getFocuses(taskLimit),
      choice: clonePendingUserChoice(this.runtime.pendingUserChoice),
    }))()
  }

  getWebUiWakeVersion(): number {
    return this.runtime.uiWakeVersion
  }

  waitForWebUiSignal(
    timeoutMs: number,
    sinceVersion = 0,
  ): Promise<{
    kind: UiWakeKind | 'timeout'
    version: number
  }> {
    return waitForUiSignal(this.runtime, timeoutMs, sinceVersion)
  }

  requestExit(code: number, reason: string): void {
    this.runtime.requestExit?.({ code, reason })
  }

  getTaskById(taskId: string): Task | undefined {
    const id = taskId.trim()
    if (!id) return undefined
    return this.runtime.tasks.find((task) => task.id === id)
  }

  cancelTask(taskId: string, meta?: { source?: string; reason?: string }) {
    return cancelTask(this.runtime, taskId, meta)
  }

  deleteTask(taskId: string, meta?: { source?: string; reason?: string }) {
    return deleteTask(this.runtime, taskId, meta)
  }

  pauseTask(taskId: string, meta?: { source?: string; reason?: string }) {
    return pauseTask(this.runtime, taskId, meta)
  }

  resumeTask(taskId: string, meta?: { source?: string; reason?: string }) {
    return resumeTask(this.runtime, taskId, meta)
  }

  getPendingUserChoice() {
    return clonePendingUserChoice(this.runtime.pendingUserChoice)
  }

  selectPendingUserChoice(
    choiceId: string,
    optionId: string,
  ): Promise<SelectPendingUserChoiceResult> {
    return selectPendingUserChoiceFromUser(this.runtime, choiceId, optionId)
  }

  getStatus(): OrchestratorStatus {
    return computeOrchestratorStatus(
      this.runtime,
      this.runtime.inflightInputs.length,
    )
  }
}
