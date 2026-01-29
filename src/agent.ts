import { execCodex } from './codex.js'
import { formatMemoryHits, type MemoryConfig, searchMemory } from './memory.js'
import { STATE_DIR_INSTRUCTION, SYSTEM_PROMPT } from './prompt.js'
import {
  type ChatMessage,
  type Protocol,
  type TaskResult,
  type UserInput,
} from './protocol.js'

export type AgentContext = {
  userInputs: UserInput[]
  taskResults: TaskResult[]
  chatHistory: ChatMessage[]
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

export const runAgent = async (
  config: AgentConfig,
  protocol: Protocol,
  context: Omit<AgentContext, 'chatHistory' | 'memoryHits'>,
): Promise<void> => {
  const chatHistory = (await protocol.getChatHistory(20)).map((msg) => msg)

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

  const processedInputIds = context.userInputs.map((input) => input.id)

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

    await protocol.removeUserInputs(processedInputIds)
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
    await protocol.removeUserInputs(processedInputIds)
    for (const r of context.taskResults) await protocol.clearTaskResult(r.id)
  }
}

const MAX_INPUT_CHARS = 1000
const MAX_HISTORY_CHARS = 400
const MAX_HISTORY_MESSAGES = 8
const MAX_TASK_RESULTS = 3
const MAX_TASK_RESULT_CHARS = 800

const truncate = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text
  if (maxChars <= 3) return text.slice(0, maxChars)
  return `${text.slice(0, maxChars - 3)}...`
}

const extractKeywords = (inputs: UserInput[]): string[] => {
  const text = inputs.map((i) => i.text).join(' ')
  if (!text) return []
  const tokens: string[] = []
  const latin = text.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? []
  tokens.push(...latin)
  const cjk = text.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  tokens.push(...cjk)
  const seen = new Set<string>()
  const result: string[] = []
  for (const token of tokens) {
    if (seen.has(token)) continue
    seen.add(token)
    result.push(token)
    if (result.length >= 12) break
  }
  return result
}

const shouldIncludeStateDir = (inputs: UserInput[]): boolean => {
  const text = inputs.map((i) => i.text.toLowerCase()).join(' ')
  if (!text) return false
  const keywords = [
    'pending_tasks',
    'task_results',
    'agent_state',
    'chat_history',
    'task log',
    'tasks.md',
    '.mimikit',
    'state dir',
    'state directory',
    'statedir',
  ]
  return keywords.some((keyword) => text.includes(keyword))
}

const filterChatHistory = (
  history: ChatMessage[],
  inputs: UserInput[],
  keywords: string[],
): ChatMessage[] => {
  const inputSet = new Set(inputs.map((i) => `${i.createdAt}|${i.text}`))
  const deduped = history.filter(
    (msg) =>
      !(msg.role === 'user' && inputSet.has(`${msg.createdAt}|${msg.text}`)),
  )
  if (deduped.length === 0) return []
  if (keywords.length === 0) return deduped.slice(-6)
  const filtered = deduped.filter((msg) => {
    const lower = msg.text.toLowerCase()
    return keywords.some((keyword) => {
      if (/[a-z0-9_]/.test(keyword)) return lower.includes(keyword)
      return msg.text.includes(keyword)
    })
  })
  if (filtered.length === 0) return deduped.slice(-6)
  return filtered.slice(-MAX_HISTORY_MESSAGES)
}

const sortTaskResults = (results: TaskResult[]): TaskResult[] =>
  results.slice().sort((a, b) => {
    const ta = Date.parse(a.completedAt) || 0
    const tb = Date.parse(b.completedAt) || 0
    return ta - tb
  })

const buildPrompt = (stateDir: string, context: AgentContext): string => {
  const parts: string[] = []
  const hasUserInputs = context.userInputs.length > 0
  const keywords = hasUserInputs ? extractKeywords(context.userInputs) : []

  parts.push(SYSTEM_PROMPT)
  if (hasUserInputs && shouldIncludeStateDir(context.userInputs)) {
    parts.push(STATE_DIR_INSTRUCTION(stateDir))
    parts.push('')
  }

  if (hasUserInputs && context.chatHistory.length > 0) {
    const history = filterChatHistory(
      context.chatHistory,
      context.userInputs,
      keywords,
    )
    if (history.length > 0) {
      parts.push('## Recent Conversation')
      for (const msg of history) {
        const prefix = msg.role === 'user' ? 'User' : 'You'
        parts.push(`[${prefix}] ${truncate(msg.text, MAX_HISTORY_CHARS)}`)
      }

      parts.push('')
    }
  }

  if (hasUserInputs && context.memoryHits) {
    parts.push(context.memoryHits)
    parts.push('')
  }

  if (hasUserInputs) {
    parts.push('## New User Inputs')
    for (const input of context.userInputs) {
      parts.push(
        `[${input.createdAt}] ${truncate(input.text, MAX_INPUT_CHARS)}`,
      )
    }

    parts.push('')
  }

  if (context.taskResults.length > 0) {
    parts.push('## Completed Tasks')
    const recent = sortTaskResults(context.taskResults).slice(-MAX_TASK_RESULTS)
    for (const result of recent) {
      parts.push(`### Task ${result.id} (${result.status})`)
      if (result.result)
        parts.push(truncate(result.result, MAX_TASK_RESULT_CHARS))
      if (result.error)
        parts.push(`Error: ${truncate(result.error, MAX_TASK_RESULT_CHARS)}`)
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
