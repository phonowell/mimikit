import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { buildPaths } from '../../fs/paths.js'
import { setDefaultLogPath } from '../../log/safe.js'
import { newId } from '../../shared/utils.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { type ChatMessage } from '../read-model/chat-view.js'
import { buildFocusViews } from '../read-model/focus-view.js'
import { sortIdleIntents } from '../read-model/intent-select.js'
import { buildTaskViews } from '../read-model/task-view.js'

import {
  addCronJob,
  type AddCronJobInput,
  cancelCronJob,
  cloneCronJob,
} from './orchestrator-cron.js'
import {
  computeOrchestratorStatus,
  type OrchestratorStatus,
} from './orchestrator-helpers.js'
import {
  addUserInput,
  getChatHistory,
  getChatMessages,
  persistStopSnapshot,
  prepareStop,
  startOrchestratorRuntime,
  waitForManagerDrain,
} from './orchestrator-runtime-ops.js'
import { waitForUiSignal } from './signals.js'

import type {
  ExitRequest,
  RuntimeState,
  UiWakeKind,
  UserMeta,
} from './runtime-state.js'
import type { CronJob, IdleIntent, Task } from '../../types/index.js'

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
      runtimeId: newId(),
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
      cronJobs: [],
      idleIntents: [],
      idleIntentArchive: [],
      focuses: [],
      focusContexts: [],
      activeFocusIds: [],
      managerTurn: 0,
      uiStream: null,
      runningControllers: new Map(),
      createTaskDebounce: new Map(),
      workerQueue: new PQueue({ concurrency: config.worker.maxConcurrent }),
      workerSignalController: new AbortController(),
      uiWakeVersion: 0,
      uiWakeEvents: new Map(),
      uiSignalControllers: new Set(),
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

  getChatHistory(limit = 50): Promise<ChatMessage[]> {
    return getChatHistory(this.runtime, limit)
  }

  getChatMessages(limit = 50, afterId?: string) {
    return getChatMessages(this.runtime, limit, afterId)
  }

  getTasks(limit = 200) {
    return buildTaskViews(this.runtime.tasks, this.runtime.cronJobs, limit)
  }

  getIntents(limit = 200): { items: IdleIntent[] } {
    const items = sortIdleIntents([
      ...this.runtime.idleIntents,
      ...this.runtime.idleIntentArchive,
    ])
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
      tasks: buildTaskViews(
        this.runtime.tasks,
        this.runtime.cronJobs,
        taskLimit,
      ),
      intents: this.getIntents(taskLimit),
      focuses: this.getFocuses(taskLimit),
      stream: this.runtime.uiStream ? { ...this.runtime.uiStream } : null,
    }))()
  }

  getWebUiStreamSnapshot() {
    return this.runtime.uiStream ? { ...this.runtime.uiStream } : null
  }

  getWebUiWakeVersion(): number {
    return this.runtime.uiWakeVersion
  }

  waitForWebUiSignal(
    timeoutMs: number,
    sinceVersion = 0,
  ): Promise<{ kind: UiWakeKind | 'timeout'; version: number }> {
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

  addCronJob(input: AddCronJobInput): Promise<CronJob> {
    return addCronJob(this.runtime, input)
  }

  getCronJobs(): CronJob[] {
    return this.runtime.cronJobs.map((job) => cloneCronJob(job))
  }

  cancelCronJob(cronJobId: string): Promise<boolean> {
    return cancelCronJob(this.runtime, cronJobId)
  }

  getStatus(): OrchestratorStatus {
    return computeOrchestratorStatus(
      this.runtime,
      this.runtime.inflightInputs.length,
    )
  }
}
