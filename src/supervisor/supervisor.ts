import { ensureStateDirs } from '../fs/init.js'
import { buildPaths } from '../fs/paths.js'
import { shortId } from '../ids.js'
import { appendLog, rotateLogIfNeeded } from '../log/append.js'
import { appendRunLog } from '../log/run-log.js'
import {
  enqueueCommandInLane,
  getLaneStats,
  setCommandLaneConcurrency,
} from '../process/command-queue.js'
import { CommandLane } from '../process/lanes.js'
import { processTriggers } from '../scheduler/triggers.js'
import {
  appendHistory,
  normalizeHistoryFile,
  readHistory,
} from '../storage/history.js'
import { appendInboxItems, readInbox } from '../storage/inbox.js'
import { migrateTask } from '../storage/migrations.js'
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
import type { InboxItem } from '../types/inbox.js'

export class Supervisor {
  private readonly config: SupervisorConfig
  private paths = buildPaths('')
  private timer: NodeJS.Timeout | null = null
  private inTick = false
  private pendingWake = false

  constructor(config: SupervisorConfig) {
    this.config = config
    this.paths = buildPaths(config.stateDir)
  }

  async start() {
    await ensureStateDirs(this.paths)
    await normalizeHistoryFile(this.paths.history)
    await recoverRunning(this.paths)
    setCommandLaneConcurrency(
      CommandLane.Teller,
      this.config.concurrency.teller,
    )
    setCommandLaneConcurrency(
      CommandLane.Planner,
      this.config.concurrency.planner,
    )
    setCommandLaneConcurrency(
      CommandLane.Worker,
      this.config.concurrency.worker,
    )
    setCommandLaneConcurrency(
      CommandLane.Internal,
      this.config.concurrency.internal,
    )
    await this.tick()
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  async addUserInput(
    text: string,
    meta?: { source?: string; remote?: string; userAgent?: string },
  ): Promise<string> {
    const id = shortId()
    const createdAt = nowIso()
    await appendInboxItems(this.paths.inbox, [{ id, text, createdAt }])
    await appendHistory(this.paths.history, {
      id,
      role: 'user',
      text,
      createdAt,
    })
    const pending = await readPendingQuestion(this.paths.pendingQuestion)
    if (pending) await writePendingQuestion(this.paths.pendingQuestion, null)
    await appendLog(this.paths.log, {
      event: 'user_input',
      id,
      ...(meta?.source ? { source: meta.source } : {}),
      ...(meta?.remote ? { remote: meta.remote } : {}),
      ...(meta?.userAgent ? { userAgent: meta.userAgent } : {}),
    })
    this.wake('user_input')
    return id
  }

  async getChatHistory(limit = 50) {
    const history = await readHistory(this.paths.history)
    if (limit <= 0) return []
    return history.slice(Math.max(0, history.length - limit))
  }

  async logEvent(entry: Record<string, unknown>) {
    await appendLog(this.paths.log, entry)
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
        listItems<Task>(this.paths.plannerQueue, migrateTask),
        listItems<Task>(this.paths.workerQueue, migrateTask),
        readInbox(this.paths.inbox),
        readPendingQuestion(this.paths.pendingQuestion),
        readTellerInbox(this.paths.tellerInbox),
      ])
    const tellerStats = getLaneStats(CommandLane.Teller)
    const plannerStats = getLaneStats(CommandLane.Planner)
    const workerStats = getLaneStats(CommandLane.Worker)
    const activeTasks =
      tellerStats.active + plannerStats.active + workerStats.active
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

  private getLatestInboxAt(inbox: InboxItem[]): number | null {
    let latest = 0
    for (const item of inbox) {
      const ts = Date.parse(item.createdAt)
      if (!Number.isFinite(ts)) continue
      if (ts > latest) latest = ts
    }
    return latest > 0 ? latest : null
  }

  private async isReturningUser(
    inbox: InboxItem[],
    latestInputAt: number,
  ): Promise<boolean> {
    const returnAfterMs = this.config.teller.returnAfterMs
    if (returnAfterMs <= 0 || !Number.isFinite(latestInputAt)) return false
    const history = await readHistory(this.paths.history)
    if (history.length === 0) return true
    const inboxIds = new Set(inbox.map((item) => item.id))
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const msg = history[i]
      if (msg.role !== 'user') continue
      if (inboxIds.has(msg.id)) continue
      const prevMs = Date.parse(msg.createdAt)
      if (!Number.isFinite(prevMs)) return true
      return latestInputAt - prevMs >= returnAfterMs
    }
    return true
  }

  private async getTellerDebounceDelay(
    inbox: InboxItem[],
  ): Promise<number | null> {
    const debounceMs = this.config.teller.debounceMs
    if (debounceMs <= 0) return null
    const latestInputAt = this.getLatestInboxAt(inbox)
    if (!latestInputAt) return null
    if (await this.isReturningUser(inbox, latestInputAt)) return null
    const elapsedMs = Date.now() - latestInputAt
    if (!Number.isFinite(elapsedMs) || elapsedMs >= debounceMs) return null
    return Math.max(0, debounceMs - elapsedMs)
  }

  private scheduleNextTick(delayMs: number) {
    if (this.timer) clearTimeout(this.timer)
    const delay = Math.max(0, delayMs)
    this.timer = setTimeout(() => this.tick(), delay)
  }

  private wake(reason: string) {
    if (this.inTick) {
      this.pendingWake = true
      return
    }
    this.scheduleNextTick(0)
    appendLog(this.paths.log, { event: 'wake', reason }).catch(() => undefined)
  }

  private async tick() {
    if (this.inTick) return
    this.inTick = true
    try {
      await rotateLogIfNeeded(this.paths.log)
      await maintainHistory({ paths: this.paths, config: this.config })

      const taskStatus = await readTaskStatus(this.paths.taskStatus)
      const triggerOutcome = await processTriggers(
        { workDir: this.config.workDir, taskStatus },
        this.paths.triggers,
        {
          checkIntervalMs: this.config.scheduler.triggerCheckMs,
          stuckMs: this.config.scheduler.triggerStuckMs,
        },
      )
      if (triggerOutcome.tasks.length > 0) {
        await appendLog(this.paths.log, {
          event: 'trigger_tasks_enqueued',
          count: triggerOutcome.tasks.length,
          taskIds: triggerOutcome.tasks.map((task) => task.id),
          triggerIds: triggerOutcome.tasks.map(
            (task) => task.sourceTriggerId ?? null,
          ),
        })
      }
      for (const task of triggerOutcome.tasks)
        await writeItem(this.paths.workerQueue, task.id, task)
      for (const task of triggerOutcome.tasks) {
        if (!task.sourceTriggerId) continue
        await appendRunLog(this.paths.triggerRuns, task.sourceTriggerId, {
          action: 'started',
          taskId: task.id,
          triggerId: task.sourceTriggerId,
          ...(task.traceId ? { traceId: task.traceId } : {}),
        })
      }

      const needsTellerFromPlanner = await processPlannerResults(this.paths)
      const needsTellerFromWorker = await processWorkerResults(
        this.paths,
        this.config,
      )
      const [inbox, tellerInbox] = await Promise.all([
        readInbox(this.paths.inbox),
        readTellerInbox(this.paths.tellerInbox),
      ])
      const hasInbox = inbox.length > 0
      const hasEvents =
        tellerInbox.length > 0 ||
        needsTellerFromPlanner ||
        needsTellerFromWorker
      const tellerDelayMs =
        !hasEvents && hasInbox
          ? await this.getTellerDebounceDelay(inbox)
          : null
      const shouldWakeTeller =
        hasEvents || (hasInbox && tellerDelayMs === null)

      const plannerStats = getLaneStats(CommandLane.Planner)
      const workerStats = getLaneStats(CommandLane.Worker)
      const tellerStats = getLaneStats(CommandLane.Teller)
      const plannerAvailable =
        this.config.concurrency.planner -
        plannerStats.active -
        plannerStats.queued
      const workerAvailable =
        this.config.concurrency.worker - workerStats.active - workerStats.queued

      if (plannerAvailable > 0) {
        dispatchPlanner({
          paths: this.paths,
          config: this.config,
          onComplete: () => this.wake('planner_complete'),
        }).catch((err) =>
          appendLog(this.paths.log, {
            event: 'planner_error',
            error: String(err),
          }),
        )
      }

      if (workerAvailable > 0) {
        dispatchWorker({
          paths: this.paths,
          config: this.config,
          available: workerAvailable,
          onComplete: () => this.wake('worker_complete'),
        }).catch((err) =>
          appendLog(this.paths.log, {
            event: 'worker_error',
            error: String(err),
          }),
        )
      }

      if (
        shouldWakeTeller &&
        tellerStats.active + tellerStats.queued < this.config.concurrency.teller
      ) {
        enqueueCommandInLane(CommandLane.Teller, async () => {
          await runTellerSession({ paths: this.paths, config: this.config })
        }).catch((err) =>
          appendLog(this.paths.log, {
            event: 'teller_error',
            error: String(err),
          }),
        )
      }

      const baseDelay = this.config.checkIntervalMs
      const triggerDelay =
        triggerOutcome.nextWakeAtMs !== null
          ? Math.max(0, triggerOutcome.nextWakeAtMs - Date.now())
          : baseDelay
      let nextDelay = Math.min(baseDelay, triggerDelay)
      if (tellerDelayMs !== null) nextDelay = Math.min(nextDelay, tellerDelayMs)
      if (this.pendingWake) {
        this.pendingWake = false
        this.scheduleNextTick(0)
      } else this.scheduleNextTick(nextDelay)
    } finally {
      this.inTick = false
    }
  }
}
