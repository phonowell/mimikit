import { type AgentConfig } from './agent.js'
import { shortId } from './id.js'
import { Protocol } from './protocol.js'
import { runSupervisorCheck } from './supervisor-check.js'
import { recoverSupervisor } from './supervisor-recover.js'
import {
  buildTaskViews,
  type TaskCounts,
  type TaskView,
} from './supervisor-task-view.js'

import type { ResolvedConfig, SupervisorConfig } from './supervisor-types.js'
import type { TaskConfig } from './task.js'

export type { SupervisorConfig } from './supervisor-types.js'
export type { TaskCounts, TaskView } from './supervisor-task-view.js'

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

  private recover(): Promise<void> {
    return recoverSupervisor(this.protocol)
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
    await runSupervisorCheck({
      protocol: this.protocol,
      config: this.config,
      agentConfig: this.agentConfig,
      taskConfig: this.taskConfig,
      activeTasks: this.activeTasks,
    })
  }

  async addUserInput(text: string): Promise<string> {
    const id = shortId()
    const now = new Date().toISOString()
    await this.protocol.addUserInput({
      id,
      text,
      createdAt: now,
    })
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

  getTasks(limit = 200): Promise<{
    tasks: TaskView[]
    counts: TaskCounts
  }> {
    return buildTaskViews(this.protocol, limit)
  }

  getChatHistory(limit = 50) {
    return this.protocol.getChatHistory(limit)
  }
}
