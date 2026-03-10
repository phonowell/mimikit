import { type AppConfig } from '../../config.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { deleteTask } from '../../worker/delete-task.js'
import { getTaskLiveOutputById } from '../../worker/live-output.js'
import { pauseTask } from '../../worker/pause-task.js'
import { resumeTask } from '../../worker/resume-task.js'
import { type ChatMessage } from '../read-model/chat-view.js'
import { buildDutyStatusView } from '../read-model/duty-status-view.js'
import { buildFocusViews } from '../read-model/focus-view.js'
import { sortTaskPlansForView } from '../read-model/plan-select.js'
import { buildTaskViews } from '../read-model/task-view.js'

import {
  startOrchestratorChannels,
  stopOrchestratorChannels,
} from './orchestrator-channel-lifecycle.js'
export { isTelegramPollingConflictError } from './orchestrator-channel-lifecycle.js'
import {
  deleteChatHistoryMessage,
  getChatHistorySnapshot,
  getChatMessagesSnapshot,
} from './orchestrator-chat-history.js'
import { type DeleteChatMessageResult } from './orchestrator-chat-history.js'
import {
  computeOrchestratorStatus,
  type OrchestratorStatus,
} from './orchestrator-helpers.js'
import { appendUserInput } from './orchestrator-input-ingress.js'
import {
  persistRuntimeSnapshotOnStop,
  prepareRuntimeStop,
  startRuntimeLifecycle,
  waitForRuntimeManagerDrain,
} from './orchestrator-runtime-lifecycle.js'
import { createRuntimeState } from './runtime-state.js'
import { waitForUiSignal } from './signals.js'
import {
  clonePendingUserChoice,
  selectPendingUserChoiceFromUser,
} from './user-choice.js'

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
  private stopChannelsAwait?: () => Promise<void>
  private restartScheduled = false
  private dutyStatusHistoryCache: ChatMessage[] | null = null

  private async readDutyStatusHistory(
    refresh = false,
    limit = 100,
  ): Promise<ChatMessage[]> {
    if (!refresh && this.dutyStatusHistoryCache)
      return this.dutyStatusHistoryCache
    const history = await getChatHistorySnapshot(this.runtime, limit)
    this.dutyStatusHistoryCache = history
    return history
  }

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
      void this.stopAndPersist().then(() => this.requestExit(75, reason))
    }, 100)
    return 'scheduled'
  }

  constructor(config: AppConfig, options: OrchestratorOptions = {}) {
    this.runtime = createRuntimeState(config, {
      ...(options.onExitRequested
        ? { onExitRequested: options.onExitRequested }
        : {}),
    })
  }

  async start() {
    await startRuntimeLifecycle(this.runtime)
    this.stopChannelsAwait = startOrchestratorChannels({
      runtime: this.runtime,
      addUserInput: (text, meta, quote) => this.addUserInput(text, meta, quote),
      requestRestart: (reason) => this.scheduleRestart(reason),
    })
  }

  stop() {
    prepareRuntimeStop(this.runtime)
    void (
      this.stopChannelsAwait?.() ??
      stopOrchestratorChannels({
        runtime: this.runtime,
        addUserInput: (text, meta, quote) =>
          this.addUserInput(text, meta, quote),
        requestRestart: (reason) => this.scheduleRestart(reason),
        mode: 'best_effort',
      })
    )
    void persistRuntimeSnapshotOnStop(this.runtime)
  }

  async stopAndPersist(): Promise<void> {
    prepareRuntimeStop(this.runtime)
    await (this.stopChannelsAwait?.() ??
      stopOrchestratorChannels({
        runtime: this.runtime,
        addUserInput: (text, meta, quote) =>
          this.addUserInput(text, meta, quote),
        requestRestart: (reason) => this.scheduleRestart(reason),
        mode: 'await',
      }))
    await waitForRuntimeManagerDrain(this.runtime)
    await persistRuntimeSnapshotOnStop(this.runtime)
  }

  addUserInput(text: string, meta?: UserMeta, quote?: string): Promise<string> {
    return appendUserInput(this.runtime, text, meta, quote)
  }

  deleteChatMessage(messageId: string): Promise<DeleteChatMessageResult> {
    return deleteChatHistoryMessage(this.runtime, messageId)
  }

  getChatHistory(limit = 50): Promise<ChatMessage[]> {
    return getChatHistorySnapshot(this.runtime, limit)
  }

  getChatMessages(limit = 50, afterId?: string) {
    return getChatMessagesSnapshot(this.runtime, limit, afterId)
  }

  getTasks(limit = 200) {
    const liveOutputByTaskId = getTaskLiveOutputById(this.runtime)
    return buildTaskViews(this.runtime.tasks, limit, {
      maxConcurrentWorkers: this.runtime.config.worker.maxConcurrent,
      runningTaskCount: this.runtime.worker.runningControllers.size,
      ...(liveOutputByTaskId ? { liveOutputByTaskId } : {}),
    })
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
      limit,
      this.runtime.tasks,
    )
  }

  async getWebUiSnapshot(messageLimit = 50, taskLimit = 200) {
    const messages = await getChatMessagesSnapshot(this.runtime, messageLimit)
    const history = await this.readDutyStatusHistory(true)
    return {
      status: this.getStatus(),
      messages,
      tasks: this.getTasks(taskLimit),
      plans: this.getPlans(taskLimit),
      focuses: this.getFocuses(taskLimit),
      choice: clonePendingUserChoice(this.runtime.ui.pendingUserChoice),
      dutyStatus: buildDutyStatusView(this.runtime.tasks, history),
    }
  }

  async getDutyStatus(refresh = false) {
    const history = await this.readDutyStatusHistory(refresh)
    return buildDutyStatusView(this.runtime.tasks, history)
  }

  getWebUiWakeVersion(): number {
    return this.runtime.ui.wakeVersion
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
    this.runtime.session.requestExit?.({ code, reason })
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
    return clonePendingUserChoice(this.runtime.ui.pendingUserChoice)
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
      this.runtime.session.inflightInputs.length,
    )
  }
}
