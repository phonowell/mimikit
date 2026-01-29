import { type AgentConfig, runAgent } from './agent.js'
import { type PendingTask, Protocol, type TaskResult } from './protocol.js'
import { runTask, type TaskConfig } from './task.js'

export type SupervisorConfig = {
  stateDir: string
  workDir: string
  model?: string | undefined
  checkIntervalMs?: number | undefined // default 1s
  selfAwakeIntervalMs?: number | undefined // default 5min
  taskTimeout?: number | undefined // default 10min
  maxConcurrentTasks?: number | undefined // default 3
}

type ResolvedConfig = {
  stateDir: string
  workDir: string
  model?: string | undefined
  checkIntervalMs: number
  selfAwakeIntervalMs: number
  taskTimeout: number
  maxConcurrentTasks: number
}

export type TaskView = {
  id: string
  status: 'pending' | 'running' | 'done' | 'failed'
  title: string
  createdAt?: string
  completedAt?: string
}

type TaskCounts = {
  pending: number
  running: number
  done: number
  failed: number
}

type TaskTitleInput = {
  id: string
  prompt?: string
  result?: string
  error?: string
}

function makeTaskTitle(input: TaskTitleInput): string {
  const raw =
    input.prompt ??
    input.result ??
    (input.error ? `Error: ${input.error}` : '')
  const line = raw.split('\n').find((item) => item.trim())?.trim() ?? ''
  if (!line) return input.id
  if (line.length <= 120) return line
  return `${line.slice(0, 117)}...`
}

function buildTitleInput(
  id: string,
  fields: {
    prompt?: string | undefined
    result?: string | undefined
    error?: string | undefined
  },
): TaskTitleInput {
  const input: TaskTitleInput = { id }
  if (fields.prompt !== undefined) input.prompt = fields.prompt
  if (fields.result !== undefined) input.result = fields.result
  if (fields.error !== undefined) input.error = fields.error
  return input
}

function taskTime(task: TaskView): number {
  const iso = task.completedAt ?? task.createdAt
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : 0
}

export class Supervisor {
  private protocol: Protocol
  private config: ResolvedConfig
  private agentConfig: AgentConfig
  private taskConfig: TaskConfig
  private running = false
  private checkTimer?: NodeJS.Timeout | undefined
  private activeTasks = new Set<string>()

  constructor(config: SupervisorConfig) {
    const checkIntervalMs = config.checkIntervalMs ?? 1_000
    const selfAwakeIntervalMs = config.selfAwakeIntervalMs ?? 5 * 60_000
    const taskTimeout = config.taskTimeout ?? 10 * 60_000
    const maxConcurrentTasks = config.maxConcurrentTasks ?? 3

    this.config = {
      stateDir: config.stateDir,
      workDir: config.workDir,
      model: config.model,
      checkIntervalMs,
      selfAwakeIntervalMs,
      taskTimeout,
      maxConcurrentTasks,
    }
    this.protocol = new Protocol(config.stateDir)
    this.agentConfig = {
      stateDir: config.stateDir,
      workDir: config.workDir,
      model: config.model,
      timeout: taskTimeout,
    }
    this.taskConfig = {
      workDir: config.workDir,
      model: config.model,
      timeout: taskTimeout,
    }
  }

  async start(): Promise<void> {
    await this.protocol.init()
    await this.recover()
    await this.protocol.appendTaskLog('supervisor:start')
    this.running = true
    this.scheduleCheck()
  }

  stop(): void {
    this.running = false
    if (this.checkTimer) {
      clearTimeout(this.checkTimer)
      this.checkTimer = undefined
    }
  }

  private async recover(): Promise<void> {
    // Recover agent state: if was running, mark as idle
    const state = await this.protocol.getAgentState()
    if (state.status === 'running') {
      await this.protocol.setAgentState({
        ...state,
        status: 'idle',
      })
      await this.protocol.appendTaskLog('supervisor:recover agent was running')
    }

    await this.protocol.restoreInflightTasks()

    // Pending tasks in pending_tasks/ dir are automatically picked up
    // Task results in task_results/ are automatically picked up
    // No additional recovery needed for file-based protocol
  }

  private scheduleCheck(): void {
    if (!this.running) return
    this.checkTimer = setTimeout(() => {
      this.check()
        .catch((error) => {
          const msg = error instanceof Error ? error.message : String(error)
          console.error(`[supervisor] fatal check error: ${msg}`)
        })
        .finally(() => this.scheduleCheck())
    }, this.config.checkIntervalMs)
  }

  private async check(): Promise<void> {
    try {
      // 1. Check if agent is already running
      const state = await this.protocol.getAgentState()
      if (state.status === 'running') return // frozen, wait for agent to sleep

      // 2. Process pending tasks (spawn child tasks)
      await this.processPendingTasks()

      // 3. Check for pending work (user inputs, task results)
      const hasPendingWork = await this.protocol.hasPendingWork()
      if (hasPendingWork) {
        await this.awakeAgent(false)
        return
      }

      // 4. Check self-awake timer
      const lastSleep = state.lastSleepAt
        ? new Date(state.lastSleepAt).getTime()
        : 0
      const now = Date.now()
      if (now - lastSleep >= this.config.selfAwakeIntervalMs)
        await this.awakeAgent(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[supervisor] check error: ${message}`)
    }
  }

  private async awakeAgent(isSelfAwake: boolean): Promise<void> {
    const [userInputs, taskResults] = await Promise.all([
      this.protocol.getUserInputs(),
      this.protocol.getTaskResults(),
    ])

    await runAgent(this.agentConfig, this.protocol, {
      userInputs,
      taskResults,
      isSelfAwake,
    })
  }

  private async processPendingTasks(): Promise<void> {
    // Atomically claim: move pending tasks to inflight
    const pending = await this.protocol.claimPendingTasks()
    if (pending.length === 0) return

    for (const task of pending) {
      // Respect concurrency limit
      if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
        await this.protocol.returnPendingTask(task)
        continue
      }

      this.activeTasks.add(task.id)

      // Run task in background (don't await)
      void (async () => {
        try {
          await runTask(this.taskConfig, this.protocol, task)
        } finally {
          this.activeTasks.delete(task.id)
          await this.protocol.clearInflightTask(task.id)
        }
      })()
    }
  }

  // HTTP interface methods
  async addUserInput(text: string): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await this.protocol.addUserInput({
      id,
      text,
      createdAt: now,
    })
    // Immediately record to chat history so WebUI can display it
    await this.protocol.addChatMessage({
      id,
      role: 'user',
      text,
      createdAt: now,
    })
    return id
  }

  async getStatus(): Promise<{
    ok: boolean
    agentStatus: 'idle' | 'running'
    activeTasks: number
    pendingTasks: number
    pendingInputs: number
  }> {
    const [state, pending, inputs] = await Promise.all([
      this.protocol.getAgentState(),
      this.protocol.getPendingTasks(),
      this.protocol.getUserInputs(),
    ])
    return {
      ok: true,
      agentStatus: state.status,
      activeTasks: this.activeTasks.size,
      pendingTasks: pending.length,
      pendingInputs: inputs.length,
    }
  }

  async getTasks(limit = 200): Promise<{
    tasks: TaskView[]
    counts: TaskCounts
  }> {
    const [pending, inflight, results] = await Promise.all([
      this.protocol.getPendingTasks(),
      this.protocol.getInflightTasks(),
      this.protocol.getTaskResults(),
    ])

    const tasks: TaskView[] = [
      ...pending.map((task) => taskToView(task, 'pending')),
      ...inflight.map((task) => taskToView(task, 'running')),
      ...results.map((result) => resultToView(result)),
    ]

    tasks.sort((a, b) => taskTime(b) - taskTime(a))

    const limited = tasks.slice(0, Math.max(0, limit))
    const counts = countTasks(limited)
    return { tasks: limited, counts }
  }

  getChatHistory(limit = 50) {
    return this.protocol.getChatHistory(limit)
  }
}

function taskToView(
  task: PendingTask,
  status: 'pending' | 'running',
): TaskView {
  const view: TaskView = {
    id: task.id,
    status,
    title: makeTaskTitle({ id: task.id, prompt: task.prompt }),
    createdAt: task.createdAt,
  }
  return view
}

function resultToView(result: TaskResult): TaskView {
  const view: TaskView = {
    id: result.id,
    status: result.status,
    title: makeTaskTitle(
      buildTitleInput(result.id, {
        prompt: result.prompt,
        result: result.result,
        error: result.error,
      }),
    ),
    completedAt: result.completedAt,
  }
  if (result.createdAt !== undefined) view.createdAt = result.createdAt
  return view
}

function countTasks(tasks: TaskView[]): TaskCounts {
  const counts: TaskCounts = { pending: 0, running: 0, done: 0, failed: 0 }
  for (const task of tasks) counts[task.status]++
  return counts
}
