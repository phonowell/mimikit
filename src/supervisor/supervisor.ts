import { buildPaths, ensureStateDirs } from '../fs/paths.js'
import { appendLog } from '../log/append.js'
import { bestEffort, setDefaultLogPath } from '../log/safe.js'
import { newId, nowIso } from '../shared/utils.js'
import { readHistory } from '../storage/jsonl.js'

import { cancelTask } from './cancel.js'
import { type ChatMessage, mergeChatMessages } from './chat-view.js'
import { managerLoop } from './manager.js'
import { hydrateRuntimeState, persistRuntimeState } from './runtime-persist.js'
import { buildTaskViews } from './task-view.js'
import { workerLoop } from './worker.js'

import type { RuntimeState, UserMeta } from './runtime.js'
import type { SupervisorConfig } from '../config.js'
import type { Task } from '../types/index.js'

export class Supervisor {
  private runtime: RuntimeState

  private persistStopSnapshot = async (): Promise<void> => {
    await bestEffort('persistRuntimeState: stop', () =>
      persistRuntimeState(this.runtime),
    )
  }

  constructor(config: SupervisorConfig) {
    const paths = buildPaths(config.stateDir)
    setDefaultLogPath(paths.log)
    this.runtime = {
      config,
      paths,
      stopped: false,
      managerRunning: false,
      managerPendingInputs: [],
      pendingInputs: [],
      pendingResults: [],
      tasks: [],
      runningWorkers: new Set(),
      runningControllers: new Map(),
      tokenBudget: {
        date: nowIso().slice(0, 10),
        spent: 0,
      },
      evolveState: {},
    }
  }

  async start() {
    await ensureStateDirs(this.runtime.paths)
    await hydrateRuntimeState(this.runtime)
    void managerLoop(this.runtime)
    void workerLoop(this.runtime)
  }

  stop() {
    this.runtime.stopped = true
    void this.persistStopSnapshot()
  }

  async stopAndPersist(): Promise<void> {
    this.runtime.stopped = true
    await this.persistStopSnapshot()
  }

  async addUserInput(
    text: string,
    meta?: UserMeta,
    quote?: string,
  ): Promise<string> {
    const id = newId()
    const createdAt = nowIso()
    this.runtime.pendingInputs.push(
      quote ? { id, text, createdAt, quote } : { id, text, createdAt },
    )
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
    if (this.runtime.managerPendingInputs.length === 0)
      return [...this.runtime.pendingInputs]
    return [...this.runtime.managerPendingInputs, ...this.runtime.pendingInputs]
  }

  async getChatHistory(limit = 50): Promise<ChatMessage[]> {
    const history = await readHistory(this.runtime.paths.history)
    return mergeChatMessages({
      history,
      inflightInputs: this.getInflightInputs(),
      limit,
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
    tokenBudget: {
      date: string
      spent: number
      limit: number
      enabled: boolean
    }
  } {
    const pendingTasks = this.runtime.tasks.filter(
      (task) => task.status === 'pending',
    ).length
    const activeTasks = this.runtime.runningWorkers.size
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
      tokenBudget: {
        date: this.runtime.tokenBudget.date,
        spent: this.runtime.tokenBudget.spent,
        limit: this.runtime.config.tokenBudget.dailyTotal,
        enabled: this.runtime.config.tokenBudget.enabled,
      },
    }
  }

  async logEvent(entry: Record<string, unknown>) {
    await bestEffort('appendLog: event', () =>
      appendLog(this.runtime.paths.log, entry),
    )
  }
}
