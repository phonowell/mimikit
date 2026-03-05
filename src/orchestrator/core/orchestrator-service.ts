import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { buildPaths } from '../../fs/paths.js'
import { setDefaultLogPath } from '../../log/safe.js'
import { createDefaultMemoryRefreshState } from '../../memory/refresh/state.js'
import { newId } from '../../shared/utils.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { getTaskLiveOutputById } from '../../worker/live-output.js'
import { type ChatMessage } from '../read-model/chat-view.js'
import { buildFocusViews } from '../read-model/focus-view.js'
import { sortTaskPlans } from '../read-model/plan-select.js'
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

export class Orchestrator {
  private runtime: RuntimeState

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
  }

  stop() {
    prepareStop(this.runtime)
    void persistStopSnapshot(this.runtime)
  }

  async stopAndPersist(): Promise<void> {
    prepareStop(this.runtime)
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
    const items = sortTaskPlans(this.runtime.taskPlans)
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
