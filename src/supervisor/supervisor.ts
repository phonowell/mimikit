import { ensureStateDirs } from '../fs/init.js'
import { buildPaths } from '../fs/paths.js'
import { newId } from '../ids.js'
import { appendLog } from '../log/append.js'
import { safe, setDefaultLogPath } from '../log/safe.js'
import { appendHistory, readHistory } from '../storage/history.js'
import { nowIso } from '../time.js'

import { cancelTask } from './cancel.js'
import { managerLoop } from './manager.js'
import { buildTaskViews } from './task-view.js'
import { workerLoop } from './worker.js'

import type { RuntimeState } from './runtime.js'
import type { SupervisorConfig } from '../config.js'

export class Supervisor {
  private runtime: RuntimeState

  constructor(config: SupervisorConfig) {
    const paths = buildPaths(config.stateDir)
    setDefaultLogPath(paths.log)
    this.runtime = {
      config,
      paths,
      stopped: false,
      managerRunning: false,
      pendingInputs: [],
      pendingResults: [],
      tasks: [],
      runningWorkers: new Set(),
      runningControllers: new Map(),
    }
  }

  async start() {
    await ensureStateDirs(this.runtime.paths)
    void managerLoop(this.runtime)
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
    return buildTaskViews(this.runtime.tasks, limit)
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
  } {
    const pendingTasks = this.runtime.tasks.filter(
      (task) => task.status === 'pending',
    ).length
    const activeTasks = this.runtime.runningWorkers.size
    const agentStatus =
      this.runtime.managerRunning || activeTasks > 0 ? 'running' : 'idle'
    const pendingInputs = this.runtime.pendingInputs.length
    return {
      ok: true,
      agentStatus,
      activeTasks,
      pendingTasks,
      pendingInputs,
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
