import PQueue from 'p-queue'

import { type AppConfig } from '../../config.js'
import { buildPaths } from '../../fs/paths.js'
import { appendLog } from '../../log/append.js'
import { bestEffort, setDefaultLogPath } from '../../log/safe.js'
import { cronWakeLoop } from '../../manager/loop-cron.js'
import { idleWakeLoop } from '../../manager/loop-idle.js'
import { managerLoop } from '../../manager/loop.js'
import { formatSystemEventText } from '../../shared/system-event.js'
import { newId, nowIso, titleFromCandidates } from '../../shared/utils.js'
import { readHistory, appendHistory } from '../../storage/history-jsonl.js'
import { publishUserInput } from '../../streams/queues.js'
import { cancelTask } from '../../worker/cancel-task.js'
import { enqueuePendingWorkerTasks, workerLoop } from '../../worker/dispatch.js'
import {
  type ChatMessage,
  type ChatMessagesMode,
  mergeChatMessages,
  selectChatMessages,
} from '../read-model/chat-view.js'
import { sortIdleIntents } from '../read-model/intent-select.js'
import { buildTaskViews } from '../read-model/task-view.js'

import {
  notifyManagerLoop,
  notifyUiSignal,
  notifyWorkerLoop,
  waitForUiSignal,
} from './signals.js'
import { persistRuntimeState, hydrateRuntimeState } from './runtime-persistence.js'

import type { RuntimeState, UiWakeKind, UserMeta } from './runtime-state.js'
import type { CronJob, IdleIntent, Task } from '../../types/index.js'

const SHUTDOWN_MANAGER_WAIT_POLL_MS = 50

export type OrchestratorStatus = {
  ok: boolean
  runtimeId: string
  agentStatus: 'idle' | 'running'
  activeTasks: number
  pendingTasks: number
  pendingInputs: number
  managerRunning: boolean
  maxWorkers: number
}

const computeOrchestratorStatus = (
  runtime: RuntimeState,
  pendingInputsCount: number,
): OrchestratorStatus => {
  const pendingTasks = runtime.tasks.filter(
    (task) => task.status === 'pending',
  ).length
  const runningTaskIds = new Set(
    runtime.tasks
      .filter((task) => task.status === 'running')
      .map((task) => task.id),
  )
  const activeTasks = [...runtime.runningControllers.keys()].filter((taskId) =>
    runningTaskIds.has(taskId),
  ).length
  const maxWorkers = runtime.config.worker.maxConcurrent
  const agentStatus =
    runtime.managerRunning || activeTasks > 0 ? 'running' : 'idle'
  return {
    ok: true,
    runtimeId: runtime.runtimeId,
    agentStatus,
    activeTasks,
    pendingTasks,
    pendingInputs: pendingInputsCount,
    managerRunning: runtime.managerRunning,
    maxWorkers,
  }
}

const USER_META_STRING_KEYS = [
  'source',
  'remote',
  'userAgent',
  'language',
  'clientLocale',
  'clientTimeZone',
  'clientNowIso',
] as const

const toUserInputLogMeta = (meta?: UserMeta): Partial<UserMeta> => {
  if (!meta) return {}
  const output: Partial<UserMeta> = {}
  for (const key of USER_META_STRING_KEYS) {
    const value = meta[key]
    if (value) output[key] = value
  }
  if (meta.clientOffsetMinutes !== undefined)
    output.clientOffsetMinutes = meta.clientOffsetMinutes
  return output
}

const addUserInput = async (
  runtime: RuntimeState,
  text: string,
  meta?: UserMeta,
  quote?: string,
): Promise<string> => {
  const id = newId()
  const createdAt = nowIso()
  const baseInput = { id, role: 'user' as const, text, createdAt }
  const input = quote ? { ...baseInput, quote } : baseInput
  await publishUserInput({ paths: runtime.paths, payload: input })
  runtime.inflightInputs.push(input)
  notifyUiSignal(runtime)
  if (meta) runtime.lastUserMeta = meta
  await appendLog(runtime.paths.log, {
    event: 'user_input',
    id,
    ...(quote ? { quote } : {}),
    ...toUserInputLogMeta(meta),
  })
  notifyManagerLoop(runtime)
  return id
}

const getChatMessages = async (
  runtime: RuntimeState,
  limit = 50,
  afterId?: string,
): Promise<{ messages: ChatMessage[]; mode: ChatMessagesMode }> => {
  const history = await readHistory(runtime.paths.history)
  return selectChatMessages({
    history,
    inflightInputs: [...runtime.inflightInputs],
    limit,
    ...(afterId ? { afterId } : {}),
  })
}

const cloneCronJob = (job: CronJob): CronJob => ({ ...job })

const addCronJob = async (
  runtime: RuntimeState,
  input: {
    cron?: string
    scheduledAt?: string
    prompt: string
    title?: string
    enabled?: boolean
  },
): Promise<CronJob> => {
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
    profile: 'worker',
    enabled: input.enabled ?? true,
    createdAt: nowIso(),
  }
  runtime.cronJobs.push(job)
  await persistRuntimeState(runtime)
  notifyUiSignal(runtime)
  return cloneCronJob(job)
}

const cancelCronJob = async (
  runtime: RuntimeState,
  cronJobId: string,
): Promise<boolean> => {
  const targetId = cronJobId.trim()
  if (!targetId) return false
  const target = runtime.cronJobs.find((job) => job.id === targetId)
  if (!target) return false
  if (!target.enabled) return true
  target.enabled = false
  target.disabledReason = 'canceled'
  await persistRuntimeState(runtime)
  notifyUiSignal(runtime)
  return true
}

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
      idleIntents: [],
      idleIntentArchive: [],
      managerTurn: 0,
      uiStream: null,
      runningControllers: new Map(),
      createTaskDebounce: new Map(),
      workerQueue: new PQueue({ concurrency: config.worker.maxConcurrent }),
      workerSignalController: new AbortController(),
      uiWakePending: false,
      uiWakeKind: null,
      uiSignalController: new AbortController(),
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
          summary: 'Session started.',
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

  async getChatHistory(limit = 50): Promise<ChatMessage[]> {
    const history = await readHistory(this.runtime.paths.history)
    return mergeChatMessages({
      history,
      inflightInputs: [...this.runtime.inflightInputs],
      limit,
    })
  }

  getChatMessages(limit = 50, afterId?: string) {
    return getChatMessages(this.runtime, limit, afterId)
  }

  getTasks(limit = 200) {
    return buildTaskViews(this.runtime.tasks, this.runtime.cronJobs, limit)
  }

  getTodos(limit = 200): { items: IdleIntent[] } {
    const items = sortIdleIntents([
      ...this.runtime.idleIntents,
      ...this.runtime.idleIntentArchive,
    ])
      .slice(0, Math.max(0, limit))
      .map((item) => ({ ...item }))
    return { items }
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
      todos: this.getTodos(taskLimit),
      stream: this.runtime.uiStream ? { ...this.runtime.uiStream } : null,
    }))()
  }

  getWebUiStreamSnapshot() {
    return this.runtime.uiStream ? { ...this.runtime.uiStream } : null
  }

  waitForWebUiSignal(timeoutMs: number): Promise<UiWakeKind | 'timeout'> {
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
    enabled?: boolean
  }): Promise<CronJob> {
    return addCronJob(this.runtime, input)
  }

  getCronJobs(): CronJob[] {
    return this.runtime.cronJobs.map((job) => cloneCronJob(job))
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
