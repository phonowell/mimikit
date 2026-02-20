import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { buildPaths } from '../../fs/paths.js'
import { bestEffort, setDefaultLogPath } from '../../log/safe.js'
import { cronWakeLoop } from '../../manager/loop-cron.js'
import { idleWakeLoop } from '../../manager/loop-idle.js'
import { managerLoop } from '../../manager/loop.js'
import { createTaskResultNotifier } from '../../notify/node-notifier.js'
import { formatSystemEventText } from '../../shared/system-event.js'
import { newId, nowIso } from '../../shared/utils.js'
import { appendHistory } from '../../storage/history-jsonl.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { enqueuePendingWorkerTasks, workerLoop } from '../../worker/dispatch.js'
import { buildTaskViews } from '../read-model/task-view.js'

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
} from './orchestrator-service-read.js'
import {
  computeOrchestratorStatus,
  type OrchestratorStatus,
} from './orchestrator-status.js'
import {
  hydrateRuntimeState,
  persistRuntimeState,
} from './runtime-persistence.js'
import { waitForUiSignal } from './ui-signal.js'
import { notifyWorkerLoop } from './worker-signal.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { CronJob, Task, WorkerProfile } from '../../types/index.js'

const SHUTDOWN_MANAGER_WAIT_POLL_MS = 50

export class Orchestrator {
  private runtime: RuntimeState

  constructor(config: AppConfig) {
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
      managerTurn: 0,
      uiStream: null,
      runningControllers: new Map(),
      createTaskDebounce: new Map(),
      workerQueue: new PQueue({ concurrency: config.worker.maxConcurrent }),
      workerSignalController: new AbortController(),
      uiWakePending: false,
      uiSignalController: new AbortController(),
      taskResultNotifier: createTaskResultNotifier(paths.log),
    }
  }

  private async waitForManagerDrain(): Promise<void> {
    while (this.runtime.managerRunning) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, SHUTDOWN_MANAGER_WAIT_POLL_MS),
      )
    }
  }

  private async persistStopSnapshot(): Promise<void> {
    await bestEffort('persistRuntimeState: stop', () =>
      persistRuntimeState(this.runtime),
    )
  }

  private prepareStop(): void {
    this.runtime.stopped = true
    this.runtime.taskResultNotifier.stop()
    notifyManagerLoop(this.runtime)
    notifyWorkerLoop(this.runtime)
  }

  async start() {
    await hydrateRuntimeState(this.runtime)
    const startedAt = nowIso()
    await bestEffort('appendHistory: startup_system_message', () =>
      appendHistory(this.runtime.paths.history, {
        id: `sys-startup-${newId()}`,
        role: 'system',
        visibility: 'user',
        text: formatSystemEventText({
          summary: 'Started',
          event: 'startup',
          payload: {
            runtime_id: this.runtime.runtimeId,
            started_at: startedAt,
          },
        }),
        createdAt: startedAt,
      }),
    )
    enqueuePendingWorkerTasks(this.runtime)
    notifyWorkerLoop(this.runtime)
    void managerLoop(this.runtime)
    void cronWakeLoop(this.runtime)
    void idleWakeLoop(this.runtime)
    void workerLoop(this.runtime)
  }

  stop() {
    this.prepareStop()
    void this.persistStopSnapshot()
  }

  async stopAndPersist(): Promise<void> {
    this.prepareStop()
    await this.waitForManagerDrain()
    await this.persistStopSnapshot()
  }

  addUserInput(text: string, meta?: UserMeta, quote?: string): Promise<string> {
    return addUserInput(this.runtime, text, meta, quote)
  }

  getChatHistory(limit = 50) {
    return getChatHistory(this.runtime, limit)
  }

  getChatMessages(limit = 50, afterId?: string) {
    return getChatMessages(this.runtime, limit, afterId)
  }

  getTasks(limit = 200) {
    return buildTaskViews(this.runtime.tasks, this.runtime.cronJobs, limit)
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
      stream: this.runtime.uiStream ? { ...this.runtime.uiStream } : null,
    }))()
  }

  waitForWebUiSignal(timeoutMs: number): Promise<void> {
    return waitForUiSignal(this.runtime, timeoutMs)
  }

  getTaskById(taskId: string): Task | undefined {
    const id = taskId.trim()
    if (!id) return undefined
    return this.runtime.tasks.find((task) => task.id === id)
  }

  cancelTask(taskId: string, meta?: { source?: string; reason?: string }) {
    return cancelTask(this.runtime, taskId, meta)
  }

  addCronJob(input: {
    cron?: string
    scheduledAt?: string
    prompt: string
    title?: string
    profile?: WorkerProfile
    enabled?: boolean
  }): Promise<CronJob> {
    return addCronJob(this.runtime, input)
  }

  getCronJobs(): CronJob[] {
    return getCronJobs(this.runtime)
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
