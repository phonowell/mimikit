import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { evolverLoop } from '../../evolver/loop.js'
import { buildPaths } from '../../fs/paths.js'
import { appendLog } from '../../log/append.js'
import { bestEffort, setDefaultLogPath } from '../../log/safe.js'
import { managerLoop } from '../../manager/loop.js'
import { newId, nowIso } from '../../shared/utils.js'
import { appendHistory } from '../../storage/jsonl.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { enqueuePendingWorkerTasks, workerLoop } from '../../worker/dispatch.js'

import { notifyManagerLoop } from './manager-signal.js'
import {
  addCronJob,
  cancelCronJob,
  getCronJobs,
} from './orchestrator-service-cron.js'
import {
  addUserInput,
  getChatHistory,
  getChatMessages,
  getInflightInputs,
  getTasks,
  getWebUiSnapshot,
  waitForWebUiSignal,
} from './orchestrator-service-read.js'
import {
  computeOrchestratorStatus,
  type OrchestratorStatus,
} from './orchestrator-status.js'
import {
  hydrateRuntimeState,
  persistRuntimeState,
} from './runtime-persistence.js'
import { notifyWorkerLoop } from './worker-signal.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { CronJob, Task, WorkerProfile } from '../../types/index.js'

export class Orchestrator {
  private runtime: RuntimeState

  private appendStartupSystemMessage = async (): Promise<void> => {
    await bestEffort('appendHistory: startup_system_message', () =>
      appendHistory(this.runtime.paths.history, {
        id: `sys-startup-${newId()}`,
        role: 'system',
        text: 'Started',
        createdAt: nowIso(),
      }),
    )
  }

  private persistStopSnapshot = async (): Promise<void> => {
    await bestEffort('persistRuntimeState: stop', () =>
      persistRuntimeState(this.runtime),
    )
  }

  constructor(config: AppConfig) {
    const paths = buildPaths(config.workDir)
    setDefaultLogPath(paths.log)
    this.runtime = {
      config,
      paths,
      stopped: false,
      managerRunning: false,
      managerSignalController: new AbortController(),
      inflightInputs: [],
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
      tasks: [],
      cronJobs: [],
      uiStream: null,
      runningControllers: new Map(),
      createTaskDebounce: new Map(),
      workerQueue: new PQueue({
        concurrency: config.worker.maxConcurrent,
      }),
      workerSignalController: new AbortController(),
      uiSignalController: new AbortController(),
    }
  }

  async start() {
    await hydrateRuntimeState(this.runtime)
    await this.appendStartupSystemMessage()
    enqueuePendingWorkerTasks(this.runtime)
    notifyWorkerLoop(this.runtime)
    void managerLoop(this.runtime)
    if (this.runtime.config.evolver.enabled) void evolverLoop(this.runtime)
    void workerLoop(this.runtime)
  }

  stop() {
    this.runtime.stopped = true
    notifyManagerLoop(this.runtime)
    notifyWorkerLoop(this.runtime)
    void this.persistStopSnapshot()
  }

  async stopAndPersist(): Promise<void> {
    this.runtime.stopped = true
    notifyManagerLoop(this.runtime)
    notifyWorkerLoop(this.runtime)
    await this.persistStopSnapshot()
  }

  async addUserInput(
    text: string,
    meta?: UserMeta,
    quote?: string,
  ): Promise<string> {
    const inputId = await addUserInput(this.runtime, text, meta, quote)
    return inputId
  }

  getInflightInputs() {
    return getInflightInputs(this.runtime)
  }

  async getChatHistory(limit = 50) {
    const history = await getChatHistory(this.runtime, limit)
    return history
  }

  async getChatMessages(limit = 50, afterId?: string) {
    const messages = await getChatMessages(this.runtime, limit, afterId)
    return messages
  }

  getTasks(limit = 200) {
    return getTasks(this.runtime, limit)
  }

  async getWebUiSnapshot(messageLimit = 50, taskLimit = 200) {
    const snapshot = await getWebUiSnapshot(
      this.runtime,
      () => this.getStatus(),
      messageLimit,
      taskLimit,
    )
    return snapshot
  }

  waitForWebUiSignal(timeoutMs: number): Promise<void> {
    return waitForWebUiSignal(this.runtime, timeoutMs)
  }

  getTaskById(taskId: string): Task | undefined {
    const trimmed = taskId.trim()
    if (!trimmed) return undefined
    return this.runtime.tasks.find((task) => task.id === trimmed)
  }

  cancelTask(taskId: string, meta?: { source?: string; reason?: string }) {
    return cancelTask(this.runtime, taskId, meta)
  }

  async addCronJob(input: {
    cron?: string
    scheduledAt?: string
    prompt: string
    title?: string
    profile?: WorkerProfile
    enabled?: boolean
  }): Promise<CronJob> {
    const cronJob = await addCronJob(this.runtime, input)
    return cronJob
  }

  getCronJobs(): CronJob[] {
    return getCronJobs(this.runtime)
  }

  async cancelCronJob(cronJobId: string): Promise<boolean> {
    const canceled = await cancelCronJob(this.runtime, cronJobId)
    return canceled
  }

  getStatus(): OrchestratorStatus {
    return computeOrchestratorStatus(
      this.runtime,
      this.getInflightInputs().length,
    )
  }

  async logEvent(entry: Record<string, unknown>) {
    await bestEffort('appendLog: event', () =>
      appendLog(this.runtime.paths.log, entry),
    )
  }
}
