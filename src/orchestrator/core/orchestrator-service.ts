import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { evolverLoop } from '../../evolver/loop.js'
import { buildPaths } from '../../fs/paths.js'
import { appendLog } from '../../log/append.js'
import { bestEffort, setDefaultLogPath } from '../../log/safe.js'
import { managerLoop } from '../../manager/loop.js'
import { newId, nowIso } from '../../shared/utils.js'
import { readHistory } from '../../storage/jsonl.js'
import { publishUserInput } from '../../streams/queues.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { enqueuePendingWorkerTasks } from '../../worker/dispatch.js'
import { workerLoop } from '../../worker/loop.js'
import {
  type ChatMessage,
  type ChatMessagesMode,
  mergeChatMessages,
  selectChatMessages,
} from '../read-model/chat-view.js'
import { buildTaskViews } from '../read-model/task-view.js'

import {
  hydrateRuntimeState,
  persistRuntimeState,
} from './runtime-persistence.js'
import { notifyWorkerLoop } from './worker-signal.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { Task } from '../../types/index.js'

export class Orchestrator {
  private runtime: RuntimeState

  private persistStopSnapshot = async (): Promise<void> => {
    await bestEffort('persistRuntimeState: stop', () =>
      persistRuntimeState(this.runtime),
    )
  }

  constructor(config: AppConfig) {
    const paths = buildPaths(config.stateDir)
    setDefaultLogPath(paths.log)
    this.runtime = {
      config,
      paths,
      stopped: false,
      managerRunning: false,
      inflightInputs: [],
      lastManagerRunAt: 0,
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
      tasks: [],
      runningControllers: new Map(),
      workerQueue: new PQueue({
        concurrency: config.worker.maxConcurrent,
      }),
      workerSignalController: new AbortController(),
    }
  }

  async start() {
    await hydrateRuntimeState(this.runtime)
    enqueuePendingWorkerTasks(this.runtime)
    notifyWorkerLoop(this.runtime)
    void managerLoop(this.runtime)
    void evolverLoop(this.runtime)
    void workerLoop(this.runtime)
  }

  stop() {
    this.runtime.stopped = true
    notifyWorkerLoop(this.runtime)
    void this.persistStopSnapshot()
  }

  async stopAndPersist(): Promise<void> {
    this.runtime.stopped = true
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
    return buildTaskViews(this.runtime.tasks, limit)
  }

  getTaskById(taskId: string): Task | undefined {
    const trimmed = taskId.trim()
    if (!trimmed) return undefined
    return this.runtime.tasks.find((task) => task.id === trimmed)
  }

  cancelTask(taskId: string, meta?: { source?: string; reason?: string }) {
    return cancelTask(this.runtime, taskId, meta)
  }

  getStatus(): {
    ok: boolean
    agentStatus: 'idle' | 'running'
    activeTasks: number
    pendingTasks: number
    pendingInputs: number
    managerRunning: boolean
    maxWorkers: number
  } {
    const pendingTasks = this.runtime.tasks.filter(
      (task) => task.status === 'pending',
    ).length
    const activeTasks = this.runtime.runningControllers.size
    const maxWorkers = this.runtime.config.worker.maxConcurrent
    const agentStatus =
      this.runtime.managerRunning || activeTasks > 0 ? 'running' : 'idle'
    const pendingInputs = this.getInflightInputs().length
    return {
      ok: true,
      agentStatus,
      activeTasks,
      pendingTasks,
      pendingInputs,
      managerRunning: this.runtime.managerRunning,
      maxWorkers,
    }
  }

  async logEvent(entry: Record<string, unknown>) {
    await bestEffort('appendLog: event', () =>
      appendLog(this.runtime.paths.log, entry),
    )
  }
}
