import { awakeAgent } from './supervisor-awake.js'
import { processPendingTasks } from './supervisor-pending.js'

import type { AgentConfig } from './agent.js'
import type { Protocol } from './protocol.js'
import type { ResolvedConfig } from './supervisor-types.js'
import type { TaskConfig } from './task.js'

export const runSupervisorCheck = async (params: {
  protocol: Protocol
  config: ResolvedConfig
  agentConfig: AgentConfig
  taskConfig: TaskConfig
  activeTasks: Set<string>
}): Promise<void> => {
  try {
    const state = await params.protocol.getAgentState()
    if (state.status === 'running') return

    await processPendingTasks({
      protocol: params.protocol,
      taskConfig: params.taskConfig,
      activeTasks: params.activeTasks,
      maxConcurrentTasks: params.config.maxConcurrentTasks,
    })

    const hasPendingWork = await params.protocol.hasPendingWork()
    if (hasPendingWork) {
      await awakeAgent(
        params.protocol,
        params.config,
        params.agentConfig,
        false,
      )
      return
    }

    const lastSleep = state.lastSleepAt
      ? new Date(state.lastSleepAt).getTime()
      : 0
    const now = Date.now()
    if (now - lastSleep >= params.config.selfAwakeIntervalMs)
      await awakeAgent(params.protocol, params.config, params.agentConfig, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[supervisor] check error: ${message}`)
  }
}
