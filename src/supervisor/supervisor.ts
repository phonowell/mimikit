import { ensureStateDirs } from '../fs/init.js'
import { buildPaths } from '../fs/paths.js'
import { shortId } from '../ids.js'
import { appendLog, rotateLogIfNeeded } from '../log/append.js'
import { processTriggers } from '../scheduler/triggers.js'
import { appendHistory, readHistory } from '../storage/history.js'
import { readInbox, writeInbox } from '../storage/inbox.js'
import {
  readPendingQuestion,
  writePendingQuestion,
} from '../storage/pending-question.js'
import { listItems, writeItem } from '../storage/queue.js'
import { readTaskStatus } from '../storage/task-status.js'
import { readTellerInbox } from '../storage/teller-inbox.js'
import { nowIso } from '../time.js'

import { dispatchPlanner, dispatchWorker } from './dispatch.js'
import { maintainHistory } from './history.js'
import { recoverRunning } from './recovery.js'
import { processPlannerResults, processWorkerResults } from './results.js'
import { runTellerSession } from './runner.js'
import { buildTaskViews } from './task-view.js'

import type { SupervisorConfig } from '../config.js'
import type { Task } from '../types/tasks.js'

export class Supervisor {
  private readonly config: SupervisorConfig
  private paths = buildPaths('')
  private timer: NodeJS.Timeout | null = null
  private inTick = false
  private tellerActive = false
  private plannerActive = false
  private workerActive = 0

  constructor(config: SupervisorConfig) {
    this.config = config
    this.paths = buildPaths(config.stateDir)
  }

  async start() {
    await ensureStateDirs(this.paths)
    await recoverRunning(this.paths)
    await this.tick()
    this.timer = setInterval(() => this.tick(), this.config.checkIntervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async addUserInput(text: string): Promise<string> {
    const id = shortId()
    const createdAt = nowIso()
    const inbox = await readInbox(this.paths.inbox)
    inbox.push({ id, text, createdAt })
    await writeInbox(this.paths.inbox, inbox)
    await appendHistory(this.paths.history, {
      id,
      role: 'user',
      text,
      createdAt,
    })
    const pending = await readPendingQuestion(this.paths.pendingQuestion)
    if (pending) await writePendingQuestion(this.paths.pendingQuestion, null)
    return id
  }

  async getChatHistory(limit = 50) {
    const history = await readHistory(this.paths.history)
    if (limit <= 0) return []
    return history.slice(Math.max(0, history.length - limit))
  }

  getTasks(limit = 200) {
    return buildTaskViews(this.paths, limit)
  }

  async getStatus(): Promise<{
    ok: boolean
    agentStatus: 'idle' | 'running'
    activeTasks: number
    pendingTasks: number
    pendingInputs: number
  }> {
    const [plannerQueue, workerQueue, inbox, pendingQuestion, tellerInbox] =
      await Promise.all([
        listItems<Task>(this.paths.plannerQueue),
        listItems<Task>(this.paths.workerQueue),
        readInbox(this.paths.inbox),
        readPendingQuestion(this.paths.pendingQuestion),
        readTellerInbox(this.paths.tellerInbox),
      ])
    const activeTasks =
      (this.tellerActive ? 1 : 0) +
      (this.plannerActive ? 1 : 0) +
      this.workerActive
    const agentStatus = activeTasks > 0 ? 'running' : 'idle'
    return {
      ok: true,
      agentStatus,
      activeTasks,
      pendingTasks: plannerQueue.length + workerQueue.length,
      pendingInputs:
        inbox.length + (pendingQuestion ? 1 : 0) + tellerInbox.length,
    }
  }

  private async tick() {
    if (this.inTick) return
    this.inTick = true
    try {
      await rotateLogIfNeeded(this.paths.log)
      await maintainHistory({ paths: this.paths, config: this.config })
      await appendLog(this.paths.log, { event: 'tick' })

      const taskStatus = await readTaskStatus(this.paths.taskStatus)
      const triggeredTasks = await processTriggers(
        { workDir: this.config.workDir, taskStatus },
        this.paths.triggers,
      )
      for (const task of triggeredTasks)
        await writeItem(this.paths.workerQueue, task.id, task)

      const needsTellerFromPlanner = await processPlannerResults(this.paths)
      const needsTellerFromWorker = await processWorkerResults(this.paths)
      const [inbox, tellerInbox] = await Promise.all([
        readInbox(this.paths.inbox),
        readTellerInbox(this.paths.tellerInbox),
      ])
      const shouldWakeTeller =
        inbox.length > 0 ||
        tellerInbox.length > 0 ||
        needsTellerFromPlanner ||
        needsTellerFromWorker

      if (!this.plannerActive) {
        this.plannerActive = true
        dispatchPlanner({ paths: this.paths, config: this.config })
          .catch((err) =>
            appendLog(this.paths.log, {
              event: 'planner_error',
              error: String(err),
            }),
          )
          .finally(() => {
            this.plannerActive = false
          })
      }

      if (this.workerActive < 3) {
        const available = 3 - this.workerActive
        this.workerActive += available
        dispatchWorker({ paths: this.paths, config: this.config, available })
          .catch((err) =>
            appendLog(this.paths.log, {
              event: 'worker_error',
              error: String(err),
            }),
          )
          .finally(() => {
            this.workerActive = Math.max(0, this.workerActive - available)
          })
      }

      if (shouldWakeTeller && !this.tellerActive) {
        this.tellerActive = true
        runTellerSession({ paths: this.paths, config: this.config })
          .catch((err) =>
            appendLog(this.paths.log, {
              event: 'teller_error',
              error: String(err),
            }),
          )
          .finally(() => {
            this.tellerActive = false
          })
      }
    } finally {
      this.inTick = false
    }
  }
}
