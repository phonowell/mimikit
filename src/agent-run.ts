import { extractDelegations } from './agent-delegation.js'
import { extractKeywords } from './agent-keywords.js'
import { buildPrompt, type SelfAwakePromptContext } from './agent-prompt.js'
import { runDelegationFlow } from './agent-run-delegation.js'
import { collectSelfAwakeCheckIdsFromDelegations } from './agent-self-awake-checks.js'
import { handleSelfAwakeTaskResults } from './agent-self-awake-results.js'
import {
  prepareSelfAwakeRun,
  type SelfAwakeRun,
} from './agent-self-awake-state.js'
import { appendAudit, getGitDiffSummary } from './audit.js'
import { readBacklog } from './backlog.js'
import { execCodex } from './codex.js'
import { shortId } from './id.js'
import { formatMemoryHits, type MemoryConfig, searchMemory } from './memory.js'

import type { AgentConfig, AgentContext } from './agent-types.js'
import type { Protocol } from './protocol.js'

const buildSelfAwakeContext = async (
  config: AgentConfig,
  selfAwake: SelfAwakeRun,
): Promise<SelfAwakePromptContext | null> => {
  const checkHistory = selfAwake.state?.checkHistory
  return {
    backlog: await readBacklog(config.stateDir),
    ...(checkHistory ? { checkHistory } : {}),
  }
}

export const runAgent = async (
  config: AgentConfig,
  protocol: Protocol,
  context: Omit<AgentContext, 'chatHistory' | 'memoryHits'>,
): Promise<void> => {
  const state = await protocol.getAgentState()
  const selfAwake = context.isSelfAwake
    ? await prepareSelfAwakeRun(config)
    : { state: null, allowDelegation: true, active: false }

  let selfAwakePromptContext: SelfAwakePromptContext | null = null
  if (context.isSelfAwake)
    selfAwakePromptContext = await buildSelfAwakeContext(config, selfAwake)

  const keywords = extractKeywords(context.userInputs)

  let chatHistory: AgentContext['chatHistory'] = []
  let memoryHits = ''

  if (context.userInputs.length > 0)
    chatHistory = await protocol.getChatHistory()

  if (context.userInputs.length > 0 && keywords.length > 0) {
    const memoryConfig: MemoryConfig = {
      workDir: config.workDir,
      memoryPaths: config.memoryPaths,
    }
    const hits = await searchMemory(memoryConfig, keywords)
    memoryHits = formatMemoryHits(hits)
  }

  const fullContext: AgentContext = {
    ...context,
    chatHistory,
    memoryHits,
  }

  const prompt = buildPrompt(
    config.stateDir,
    fullContext,
    selfAwakePromptContext,
  )

  await protocol.setAgentState({
    status: 'running',
    lastAwakeAt: new Date().toISOString(),
  })

  await protocol.appendTaskLog(
    `agent:awake reason=${context.isSelfAwake ? 'timer' : 'event'}`,
  )

  const processedInputIds = context.userInputs.map((input) => input.id)

  try {
    const result = await execCodex({
      prompt,
      workDir: config.workDir,
      model: config.model,
      timeout: config.timeout ?? 10 * 60 * 1000,
    })

    const { cleanedOutput, delegations } = extractDelegations(result.output)
    const attemptedChecks = context.isSelfAwake
      ? collectSelfAwakeCheckIdsFromDelegations(delegations)
      : []
    await runDelegationFlow({
      config,
      protocol,
      isSelfAwake: context.isSelfAwake,
      selfAwake,
      delegations,
      attemptedChecks,
    })

    try {
      await handleSelfAwakeTaskResults(config, context.taskResults)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:handle-error',
        trigger: 'self-awake',
        detail: message,
        diff: await getGitDiffSummary(config.workDir),
      })
    }

    const trimmedOutput = cleanedOutput.trim()
    if (trimmedOutput) {
      await protocol.addChatMessage({
        id: shortId(),
        role: 'agent',
        text: trimmedOutput,
        createdAt: new Date().toISOString(),
        ...(result.usage ? { usage: result.usage } : {}),
      })
    }

    await protocol.setAgentState({
      status: 'idle',
      lastAwakeAt: state.lastAwakeAt,
      lastSleepAt: new Date().toISOString(),
    })

    await protocol.appendTaskLog('agent:sleep')

    await protocol.removeUserInputs(processedInputIds)
    for (const r of context.taskResults) await protocol.clearTaskResult(r.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await protocol.setAgentState({
      status: 'idle',
      lastAwakeAt: state.lastAwakeAt,
      lastSleepAt: new Date().toISOString(),
    })
    await protocol.appendTaskLog(`agent:error ${message}`)

    await protocol.removeUserInputs(processedInputIds)
    for (const r of context.taskResults) await protocol.clearTaskResult(r.id)
  }
}
