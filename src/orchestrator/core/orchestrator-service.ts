import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { evolverLoop } from '../../evolver/loop.js'
import { buildPaths } from '../../fs/paths.js'
import { appendLog } from '../../log/append.js'
import { bestEffort, setDefaultLogPath } from '../../log/safe.js'
import { managerLoop } from '../../manager/loop.js'
import { newId, nowIso, titleFromCandidates } from '../../shared/utils.js'
import { appendHistory, readHistory } from '../../storage/jsonl.js'
import { publishUserInput } from '../../streams/queues.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { enqueuePendingWorkerTasks, workerLoop } from '../../worker/dispatch.js'
import {
  type ChatMessage,
  type ChatMessagesMode,
  mergeChatMessages,
  selectChatMessages,
} from '../read-model/chat-view.js'
import { buildTaskViews } from '../read-model/task-view.js'

import { notifyManagerLoop } from './manager-signal.js'
import {
  computeOrchestratorStatus,
  type OrchestratorStatus,
} from './orchestrator-status.js'
import {
  hydrateRuntimeState,
  persistRuntimeState,
} from './runtime-persistence.js'
import { notifyUiSignal, waitForUiSignal } from './ui-signal.js'
import { notifyWorkerLoop } from './worker-signal.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { CronJob, Task, WorkerProfile } from '../../types/index.js'

const cloneCronJob = (job: CronJob): CronJob => ({ ...job })

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
    const id = newId()
    const createdAt = nowIso()
    const input = quote
      ? { id, text, createdAt, quote }
      : { id, text, createdAt }
    await publishUserInput({
      paths: this.runtime.paths,
      payload: input,
    })
    this.runtime.inflightInputs.push(input)
    if (meta) this.runtime.lastUserMeta = meta
    await appendLog(this.runtime.paths.log, {
      event: 'user_input',
      id,
      ...(quote ? { quote } : {}),
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.remote ? { remote: meta.remote } : {}),
      ...(meta?.userAgent ? { userAgent: meta.userAgent } : {}),
      ...(meta?.language ? { language: meta.language } : {}),
      ...(meta?.clientLocale ? { clientLocale: meta.clientLocale } : {}),
      ...(meta?.clientTimeZone ? { clientTimeZone: meta.clientTimeZone } : {}),
      ...(meta?.clientOffsetMinutes !== undefined
        ? { clientOffsetMinutes: meta.clientOffsetMinutes }
        : {}),
      ...(meta?.clientNowIso ? { clientNowIso: meta.clientNowIso } : {}),
    })
    notifyManagerLoop(this.runtime)
    return id
  }

  getInflightInputs() {
    return [...this.runtime.inflightInputs]
  }

  async getChatHistory(limit = 50): Promise<ChatMessage[]> {
    const history = await readHistory(this.runtime.paths.history)
    return mergeChatMessages({
      history,
      inflightInputs: this.getInflightInputs(),
      limit,
    })
  }

  async getChatMessages(
    limit = 50,
    afterId?: string,
  ): Promise<{ messages: ChatMessage[]; mode: ChatMessagesMode }> {
    const history = await readHistory(this.runtime.paths.history)
    return selectChatMessages({
      history,
      inflightInputs: this.getInflightInputs(),
      limit,
      ...(afterId ? { afterId } : {}),
    })
  }

  getTasks(limit = 200) {
    return buildTaskViews(this.runtime.tasks, this.runtime.cronJobs, limit)
  }

  async getWebUiSnapshot(messageLimit = 50, taskLimit = 200) {
    const [messages, tasks] = await Promise.all([
      this.getChatMessages(messageLimit),
      Promise.resolve(this.getTasks(taskLimit)),
    ])
    const stream = this.runtime.uiStream
    return {
      status: this.getStatus(),
      messages,
      tasks,
      stream: stream
        ? {
            id: stream.id,
            role: stream.role,
            text: stream.text,
            ...(stream.usage ? { usage: stream.usage } : {}),
            createdAt: stream.createdAt,
            updatedAt: stream.updatedAt,
          }
        : null,
    }
  }

  waitForWebUiSignal(timeoutMs: number): Promise<void> {
    return waitForUiSignal(this.runtime, timeoutMs)
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
    const prompt = input.prompt.trim()
    if (!prompt) throw new Error('add_cron_job_prompt_empty')
    const cron = input.cron?.trim()
    const scheduledAt = input.scheduledAt?.trim()
    if (!cron && !scheduledAt) throw new Error('add_cron_job_schedule_missing')
    if (cron && scheduledAt) throw new Error('add_cron_job_schedule_conflict')
    const id = newId()
    const job: CronJob = {
      id,
      ...(cron ? { cron } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
      prompt,
      title: titleFromCandidates(id, [input.title, prompt]),
      profile: input.profile ?? 'standard',
      enabled: input.enabled ?? true,
      createdAt: nowIso(),
    }
    this.runtime.cronJobs.push(job)
    await persistRuntimeState(this.runtime)
    notifyUiSignal(this.runtime)
    return cloneCronJob(job)
  }

  getCronJobs(): CronJob[] {
    return this.runtime.cronJobs.map((job) => cloneCronJob(job))
  }

  async cancelCronJob(cronJobId: string): Promise<boolean> {
    const targetId = cronJobId.trim()
    if (!targetId) return false
    const target = this.runtime.cronJobs.find((job) => job.id === targetId)
    if (!target) return false
    if (!target.enabled) return true
    target.enabled = false
    target.disabledReason = 'canceled'
    await persistRuntimeState(this.runtime)
    notifyUiSignal(this.runtime)
    return true
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
