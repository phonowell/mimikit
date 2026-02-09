import PQueue from 'p-queue'

import { buildPaths, ensureStateDirs } from '../fs/paths.js'
import { appendLog } from '../log/append.js'
import { bestEffort, setDefaultLogPath } from '../log/safe.js'
import { newId, nowIso } from '../shared/utils.js'
import { readHistory } from '../storage/jsonl.js'
import { publishUserInput } from '../streams/channels.js'

import { cancelTask } from './cancel.js'
import {
  type ChatMessage,
  type ChatMessagesMode,
  mergeChatMessages,
  selectChatMessages,
} from './chat-view.js'
import { hydrateRuntimeState, persistRuntimeState } from './runtime-persist.js'
import { buildTaskViews } from './task-view.js'
import { tellerLoop } from './teller-loop.js'
import { thinkerLoop } from './thinker-cycle.js'
import { enqueuePendingWorkerTasks } from './worker-dispatch.js'
import { workerLoop } from './worker-loop.js'
import { notifyWorkerLoop } from './worker-signal.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { AppConfig } from '../config.js'
import type { Task } from '../types/index.js'

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
      thinkerRunning: false,
      inflightInputs: [],
      lastThinkerRunAt: 0,
      channels: {
        teller: {
          userInputCursor: 0,
          workerResultCursor: 0,
          thinkerDecisionCursor: 0,
        },
        thinker: {
          tellerDigestCursor: 0,
        },
      },
      tasks: [],
      runningControllers: new Map(),
      workerQueue: new PQueue({
        concurrency: config.worker.maxConcurrent,
      }),
      workerSignalController: new AbortController(),
      reportingState: {},
    }
  }

  async start() {
    await ensureStateDirs(this.runtime.paths)
    await hydrateRuntimeState(this.runtime)
    enqueuePendingWorkerTasks(this.runtime)
    notifyWorkerLoop(this.runtime)
    void tellerLoop(this.runtime)
    void thinkerLoop(this.runtime)
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
    thinkerRunning: boolean
    maxWorkers: number
  } {
    const pendingTasks = this.runtime.tasks.filter(
      (task) => task.status === 'pending',
    ).length
    const activeTasks = this.runtime.runningControllers.size
    const maxWorkers = this.runtime.config.worker.maxConcurrent
    const agentStatus =
      this.runtime.thinkerRunning || activeTasks > 0 ? 'running' : 'idle'
    const pendingInputs = this.getInflightInputs().length
    return {
      ok: true,
      agentStatus,
      activeTasks,
      pendingTasks,
      pendingInputs,
      thinkerRunning: this.runtime.thinkerRunning,
      maxWorkers,
    }
  }

  async logEvent(entry: Record<string, unknown>) {
    await bestEffort('appendLog: event', () =>
      appendLog(this.runtime.paths.log, entry),
    )
  }
}
