import { type AppConfig } from '../../config.js'
import { resumeRecoverableTasks } from '../../worker/resume-task.js'

import {
  startChannelSession,
  stopChannelSession,
} from './orchestrator-channel-session.js'
export { isTelegramPollingConflictError } from './orchestrator-channel-lifecycle.js'
import { deleteChatHistoryMessage } from './orchestrator-chat-history.js'
import { type DeleteChatMessageResult } from './orchestrator-chat-history.js'
import {
  computeOrchestratorStatus,
  type OrchestratorStatus,
} from './orchestrator-helpers.js'
import { appendUserInput } from './orchestrator-input-ingress.js'
import { scheduleOrchestratorRestart } from './orchestrator-restart-policy.js'
import {
  persistRuntimeSnapshotOnStop,
  prepareRuntimeStop,
  startRuntimeLifecycle,
  waitForRuntimeManagerDrain,
} from './orchestrator-runtime-lifecycle.js'
import {
  mutateTaskByAction,
  resolveTaskById,
  type TaskMutationAction,
  type TaskMutationMeta,
} from './orchestrator-task-actions.js'
import {
  buildOrchestratorTaskViews,
  buildOrchestratorWebUiDeltaSnapshot,
  buildOrchestratorWebUiSnapshot,
} from './orchestrator-webui-snapshot.js'
import { createRuntimeState } from './runtime-state.js'
import { waitForUiSignal } from './signals.js'
import { selectPendingUserChoiceFromUser } from './user-choice.js'

import type { RuntimeState, UiWakeKind, UserMeta } from './runtime-state.js'
import type { SelectPendingUserChoiceResult } from './user-choice.js'

export type { OrchestratorStatus } from './orchestrator-helpers.js'

type OrchestratorOptions = Parameters<typeof createRuntimeState>[1]

export class Orchestrator {
  private runtime: RuntimeState
  private stopChannelsAwait?: () => Promise<void>
  private restartScheduled = false
  private readonly channelInput = (
    text: string,
    meta?: UserMeta,
    quote?: string,
  ) => this.addUserInput(text, meta, quote)
  private readonly channelRestart = (
    reason: string,
  ): 'scheduled' | 'busy' | 'already_scheduled' =>
    scheduleOrchestratorRestart({
      reason,
      getStatus: () => this.getStatus(),
      restartScheduled: this.restartScheduled,
      markScheduled: () => {
        this.restartScheduled = true
      },
      runRestart: async () => {
        await this.stopAndPersist()
        this.requestExit(75, reason)
      },
    })

  constructor(config: AppConfig, options: OrchestratorOptions) {
    this.runtime = createRuntimeState(config, {
      runtimeId: options.runtimeId,
      startup: options.startup,
      ...(options.onExitRequested
        ? { onExitRequested: options.onExitRequested }
        : {}),
    })
  }

  async start() {
    await startRuntimeLifecycle(this.runtime)
    this.stopChannelsAwait = startChannelSession({
      runtime: this.runtime,
      addUserInput: this.channelInput,
      requestRestart: this.channelRestart,
    })
  }

  stop() {
    prepareRuntimeStop(this.runtime)
    void stopChannelSession({
      runtime: this.runtime,
      addUserInput: this.channelInput,
      requestRestart: this.channelRestart,
      mode: 'best_effort',
      ...(this.stopChannelsAwait ? { stopAwait: this.stopChannelsAwait } : {}),
    })
    void persistRuntimeSnapshotOnStop(this.runtime)
  }

  async stopAndPersist(): Promise<void> {
    prepareRuntimeStop(this.runtime)
    await stopChannelSession({
      runtime: this.runtime,
      addUserInput: this.channelInput,
      requestRestart: this.channelRestart,
      mode: 'await',
      ...(this.stopChannelsAwait ? { stopAwait: this.stopChannelsAwait } : {}),
    })
    await waitForRuntimeManagerDrain(this.runtime)
    await persistRuntimeSnapshotOnStop(this.runtime)
  }

  addUserInput(text: string, meta?: UserMeta, quote?: string): Promise<string> {
    return appendUserInput(this.runtime, text, meta, quote)
  }

  deleteChatMessage(messageId: string): Promise<DeleteChatMessageResult> {
    return deleteChatHistoryMessage(this.runtime, messageId)
  }

  getTasks(limit = 200) {
    return buildOrchestratorTaskViews(this.runtime, limit)
  }

  getWebUiDeltaSnapshot(messageLimit = 50, afterId?: string) {
    return buildOrchestratorWebUiDeltaSnapshot({
      runtime: this.runtime,
      status: this.getStatus(),
      messageLimit,
      ...(afterId ? { afterId } : {}),
    })
  }

  getWebUiSnapshot(messageLimit = 50, taskLimit = 200) {
    return buildOrchestratorWebUiSnapshot({
      runtime: this.runtime,
      status: this.getStatus(),
      messageLimit,
      taskLimit,
    })
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

  getTaskById(taskId: string) {
    return resolveTaskById(this.runtime, taskId)
  }

  mutateTask(
    action: TaskMutationAction,
    taskId: string,
    meta?: TaskMutationMeta,
  ) {
    return mutateTaskByAction(this.runtime, action, taskId, meta)
  }

  resumeRecoverableTasks() {
    return resumeRecoverableTasks(this.runtime)
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
