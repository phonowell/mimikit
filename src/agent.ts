import { execCodex } from './codex.js'
import { formatMemoryHits, type MemoryConfig, searchMemory } from './memory.js'
import { STATE_DIR_INSTRUCTION, SYSTEM_PROMPT } from './prompt.js'
import { type Protocol, type TaskResult, type UserInput } from './protocol.js'

export type AgentContext = {
  userInputs: UserInput[]
  taskResults: TaskResult[]
  chatHistory: string[]
  memoryHits: string
  isSelfAwake: boolean
}

export type AgentConfig = {
  stateDir: string
  workDir: string
  model?: string | undefined
  timeout?: number | undefined
  memoryPaths?: string[] | undefined
  maxMemoryHits?: number | undefined
}

export async function runAgent(
  config: AgentConfig,
  protocol: Protocol,
  context: Omit<AgentContext, 'chatHistory' | 'memoryHits'>,
): Promise<void> {
  const chatHistory = (await protocol.getChatHistory(20)).map((msg) => {
    const prefix = msg.role === 'user' ? 'User' : 'You'
    return `[${prefix}] ${msg.text.slice(0, 500)}`
  })

  let memoryHits = ''
  if (context.userInputs.length > 0) {
    const query = context.userInputs.map((i) => i.text).join(' ')
    const memoryConfig: MemoryConfig = {
      workDir: config.workDir,
      memoryPaths: config.memoryPaths,
      maxHits: config.maxMemoryHits ?? 10,
    }
    const hits = await searchMemory(memoryConfig, query)
    memoryHits = formatMemoryHits(hits)
  }

  const fullContext: AgentContext = {
    ...context,
    chatHistory,
    memoryHits,
  }

  const prompt = buildPrompt(config.stateDir, fullContext)

  // User messages already recorded by Supervisor at input time

  const state = await protocol.getAgentState()
  const { sessionId } = state

  await protocol.setAgentState({
    status: 'running',
    lastAwakeAt: new Date().toISOString(),
    sessionId,
  })

  await protocol.appendTaskLog(
    `agent:awake reason=${context.isSelfAwake ? 'timer' : 'event'}`,
  )

  try {
    const result = await execCodex({
      prompt,
      sessionId,
      workDir: config.workDir,
      model: config.model,
      timeout: config.timeout ?? 10 * 60 * 1000,
    })

    if (result.output.trim()) {
      await protocol.addChatMessage({
        id: crypto.randomUUID(),
        role: 'agent',
        text: result.output.trim(),
        createdAt: new Date().toISOString(),
      })
    }

    await protocol.setAgentState({
      status: 'idle',
      lastAwakeAt: state.lastAwakeAt,
      lastSleepAt: new Date().toISOString(),
      sessionId: result.sessionId ?? sessionId,
    })

    await protocol.appendTaskLog(
      `agent:sleep sessionId=${result.sessionId ?? 'none'}`,
    )

    await protocol.clearUserInputs()
    for (const r of context.taskResults) await protocol.clearTaskResult(r.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await protocol.setAgentState({
      status: 'idle',
      lastAwakeAt: state.lastAwakeAt,
      lastSleepAt: new Date().toISOString(),
      sessionId,
    })
    await protocol.appendTaskLog(`agent:error ${message}`)

    // Clear inputs even on failure to avoid infinite retry loops
    await protocol.clearUserInputs()
    for (const r of context.taskResults) await protocol.clearTaskResult(r.id)
  }
}

function buildPrompt(stateDir: string, context: AgentContext): string {
  const parts: string[] = []

  parts.push(SYSTEM_PROMPT)
  parts.push(STATE_DIR_INSTRUCTION(stateDir))
  parts.push('')

  if (context.chatHistory.length > 0) {
    parts.push('## Recent Conversation')
    for (const line of context.chatHistory) parts.push(line)

    parts.push('')
  }

  if (context.memoryHits) {
    parts.push(context.memoryHits)
    parts.push('')
  }

  if (context.userInputs.length > 0) {
    parts.push('## New User Inputs')
    for (const input of context.userInputs)
      parts.push(`[${input.createdAt}] ${input.text}`)

    parts.push('')
  }

  if (context.taskResults.length > 0) {
    parts.push('## Completed Tasks')
    for (const result of context.taskResults) {
      parts.push(`### Task ${result.id} (${result.status})`)
      if (result.result) parts.push(result.result.slice(0, 2000))
      if (result.error) parts.push(`Error: ${result.error}`)
      parts.push('')
    }
  }

  if (
    context.isSelfAwake &&
    context.userInputs.length === 0 &&
    context.taskResults.length === 0
  ) {
    parts.push('## Self-Awake')
    parts.push('No pending user inputs or task results.')
    parts.push(
      'Consider: reviewing recent work, planning improvements, or assigning yourself a task.',
    )
    parts.push('')
  }

  return parts.join('\n')
}
