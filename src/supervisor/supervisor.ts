import { ensureStateDirs } from '../fs/init.js'
import { buildPaths } from '../fs/paths.js'
import { newId } from '../ids.js'
import { appendLog } from '../log/append.js'
import { safe, setDefaultLogPath } from '../log/safe.js'
import { appendHistory, readHistory } from '../storage/history.js'
import { listTasks } from '../storage/tasks.js'
import { readUserInputs } from '../storage/user-inputs.js'
import { nowIso } from '../time.js'

import { buildTaskViews } from './task-view.js'
import { tellerLoop } from './teller.js'
import { thinkerLoop } from './thinker.js'
import { workerLoop } from './worker.js'

import type { RuntimeState } from './runtime.js'
import type { SupervisorConfig } from '../config.js'
import type { TokenUsage } from '../types/usage.js'

export class Supervisor {
  private runtime: RuntimeState

  constructor(config: SupervisorConfig) {
    const paths = buildPaths(config.stateDir)
    setDefaultLogPath(paths.log)
    this.runtime = {
      config,
      paths,
      stopped: false,
      pendingInputs: [],
      lastUserInputAt: 0,
      lastTellerReplyAt: 0,
      thinkerRunning: false,
      runningWorkers: new Set(),
    }
  }

  async start() {
    await ensureStateDirs(this.runtime.paths)
    void tellerLoop(this.runtime)
    void thinkerLoop(this.runtime)
    void workerLoop(this.runtime)
  }

  stop() {
    this.runtime.stopped = true
  }

  async addUserInput(
    text: string,
    meta?: {
      source?: string
      remote?: string
      userAgent?: string
      language?: string
      clientLocale?: string
      clientTimeZone?: string
      clientOffsetMinutes?: number
      clientNowIso?: string
    },
  ): Promise<string> {
    const id = newId()
    const createdAt = nowIso()
    this.runtime.pendingInputs.push({ id, text, createdAt })
    this.runtime.lastUserInputAt = Date.now()
    if (meta) this.runtime.lastUserMeta = meta
    await appendHistory(this.runtime.paths.history, {
      id,
      role: 'user',
      text,
      createdAt,
    })
    await appendLog(this.runtime.paths.log, {
      event: 'user_input',
      id,
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

  async getChatHistory(limit = 50) {
    const history = await readHistory(this.runtime.paths.history)
    if (limit <= 0) return []
    return history.slice(Math.max(0, history.length - limit))
  }

  getTasks(limit = 200) {
    return buildTaskViews(this.runtime.paths, limit)
  }

  async getStatus(): Promise<{
    ok: boolean
    agentStatus: 'idle' | 'running'
    thinkerStatus: 'idle' | 'running'
    activeTasks: number
    pendingTasks: number
    pendingInputs: number
    thinkerLastElapsedMs?: number
    thinkerLastUsage?: TokenUsage
    thinkerLastAt?: string
    thinkerLastError?: string
  }> {
    const tasks = await listTasks(this.runtime.paths.agentQueue)
    const pendingTasks = tasks.filter((task) => task.status === 'queued').length
    const activeTasks = this.runtime.runningWorkers.size
    const agentStatus = activeTasks > 0 ? 'running' : 'idle'
    const thinkerStatus = this.runtime.thinkerRunning ? 'running' : 'idle'
    const inputs = await readUserInputs(this.runtime.paths.userInputs)
    const pendingInputs =
      this.runtime.pendingInputs.length +
      inputs.filter((input) => !input.processedByThinker).length
    return {
      ok: true,
      agentStatus,
      thinkerStatus,
      activeTasks,
      pendingTasks,
      pendingInputs,
      ...(this.runtime.thinkerLast?.elapsedMs !== undefined
        ? { thinkerLastElapsedMs: this.runtime.thinkerLast.elapsedMs }
        : {}),
      ...(this.runtime.thinkerLast?.usage
        ? { thinkerLastUsage: this.runtime.thinkerLast.usage }
        : {}),
      ...(this.runtime.thinkerLast?.endedAt
        ? { thinkerLastAt: this.runtime.thinkerLast.endedAt }
        : {}),
      ...(this.runtime.thinkerLast?.error
        ? { thinkerLastError: this.runtime.thinkerLast.error }
        : {}),
    }
  }

  async logEvent(entry: Record<string, unknown>) {
    await safe(
      'appendLog: event',
      () => appendLog(this.runtime.paths.log, entry),
      {
        fallback: undefined,
      },
    )
  }
}
