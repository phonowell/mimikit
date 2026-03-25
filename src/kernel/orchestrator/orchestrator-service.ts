import { type AppConfig } from '../../bootstrap/config.js'
import { resumeRecoverableTasks } from '../../execution/worker/resume-task.js'
import {
  deleteChatHistoryMessage,
  type DeleteChatMessageResult,
} from '../../surface/orchestrator/orchestrator-chat-history.js'
import { appendUserInput } from '../../surface/orchestrator/orchestrator-input-ingress.js'
import {
  buildOrchestratorTaskViews,
  buildOrchestratorWebUiDeltaSnapshot,
  buildOrchestratorWebUiSnapshot,
} from '../../surface/orchestrator/orchestrator-webui-snapshot.js'
import {
  mutateTaskByAction,
  resolveTaskById,
  type TaskMutationAction,
  type TaskMutationMeta,
} from '../../work/orchestrator/orchestrator-task-actions.js'
import { selectPendingUserChoiceFromUser } from '../../work/orchestrator/user-choice.js'

import {
  startChannelSession,
  stopChannelSession,
} from './orchestrator-channel-session.js'
import {
  computeOrchestratorStatus,
  type OrchestratorStatus,
} from './orchestrator-helpers.js'
import { scheduleOrchestratorRestart } from './orchestrator-restart-policy.js'
import {
  persistRuntimeSnapshotOnStop,
  prepareRuntimeStop,
  startRuntimeLifecycle,
  waitForRuntimeManagerDrain,
} from './orchestrator-runtime-lifecycle.js'
import { createRuntimeState } from './runtime-state.js'
import { waitForUiSignal } from './signals.js'

import type { RuntimeState, UiWakeKind, UserMeta } from './runtime-state.js'
import type { SelectPendingUserChoiceResult } from '../../work/orchestrator/user-choice.js'

export { isTelegramPollingConflictError } from './orchestrator-channel-lifecycle.js'
export type { OrchestratorStatus } from './orchestrator-helpers.js'

type OrchestratorOptions = Parameters<typeof createRuntimeState>[1]

export class Orchestrator {
  private runtime: RuntimeState
  private stopChannelsAwait?: () => Promise<void>
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
      restartScheduled: this.runtime.session.restartScheduled,
      markScheduled: () => {
        this.runtime.session.restartScheduled = true
      },
      runRestart: async () => {
        await this.stopAndPersist()
        this.requestExit(75, reason, { skipPersist: true })
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

  requestExit(
    code: number,
    reason: string,
    options?: { skipPersist?: boolean },
  ): void {
    this.runtime.session.requestExit?.({
      code,
      reason,
      ...(options?.skipPersist ? { skipPersist: true } : {}),
    })
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
