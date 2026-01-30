import { type AgentConfig, runAgent } from './agent.js'
import { maybeMemoryFlush } from './memory/flush.js'
import { runMemoryRollup } from './memory/rollup.js'
import { maybeAutoHandoff } from './memory/session-hook.js'

import type { Protocol } from './protocol.js'
import type { ResolvedConfig } from './supervisor-types.js'

export const awakeAgent = async (
  protocol: Protocol,
  config: ResolvedConfig,
  agentConfig: AgentConfig,
  isSelfAwake: boolean,
): Promise<void> => {
  const [userInputs, taskResults, chatHistory] = await Promise.all([
    protocol.getUserInputs(),
    protocol.getTaskResults(),
    protocol.getChatHistory(1000),
  ])

  try {
    const handoff = await maybeAutoHandoff({
      stateDir: config.stateDir,
      workDir: config.workDir,
      userInputs,
      chatHistory,
    })
    if (handoff.didHandoff) {
      await protocol.appendTaskLog(
        `memory:handoff reason=${handoff.reason ?? 'unknown'} path=${handoff.path ?? 'none'}`,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await protocol.appendTaskLog(`memory:handoff failed error=${message}`)
  }

  try {
    const flush = await maybeMemoryFlush({
      stateDir: config.stateDir,
      workDir: config.workDir,
      chatHistory,
      userInputs,
    })
    if (flush.didFlush)
      await protocol.appendTaskLog(`memory:flush path=${flush.path ?? 'none'}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await protocol.appendTaskLog(`memory:flush failed error=${message}`)
  }

  if (isSelfAwake) {
    try {
      const rollup = await runMemoryRollup({
        stateDir: config.stateDir,
        workDir: config.workDir,
        model: config.model,
      })
      if (rollup.dailySummaries || rollup.monthlySummaries) {
        await protocol.appendTaskLog(
          `memory:rollup daily=${rollup.dailySummaries} monthly=${rollup.monthlySummaries}`,
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await protocol.appendTaskLog(`memory:rollup failed error=${message}`)
    }
  }

  await runAgent(agentConfig, protocol, {
    userInputs,
    taskResults,
    isSelfAwake,
  })
}
