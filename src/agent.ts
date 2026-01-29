import { execCodex } from './codex.js'
import { shortId } from './id.js'
import { formatMemoryHits, type MemoryConfig, searchMemory } from './memory.js'
import {
  CORE_PROMPT,
  MEMORY_SECTION,
  SELF_AWAKE_SECTION,
  STATE_DIR_INSTRUCTION,
  TASK_DELEGATION_SECTION,
} from './prompt.js'
import {
  type ChatMessage,
  type PendingTask,
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
  const state = await protocol.getAgentState()
  const { sessionId } = state
  const isResume = !!sessionId

  // Extract keywords early for memory search and history filtering
  const keywords = extractKeywords(context.userInputs)

  let chatHistory: ChatMessage[] = []
  let memoryHits = ''

  if (!isResume) {
    if (context.userInputs.length > 0)
      chatHistory = await protocol.getChatHistory(HISTORY_FETCH_LIMIT)

    if (context.userInputs.length > 0 && keywords.length > 0) {
      const memoryConfig: MemoryConfig = {
        workDir: config.workDir,
        memoryPaths: config.memoryPaths,
        maxHits: config.maxMemoryHits ?? 6,
      }
      const hits = await searchMemory(memoryConfig, keywords)
      memoryHits = formatMemoryHits(hits)
    }
  }

  const fullContext: AgentContext = {
    ...context,
    chatHistory,
    memoryHits,
  }

  const prompt = isResume
    ? buildResumePrompt(fullContext)
    : buildPrompt(config.stateDir, fullContext, keywords)

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

    const { cleanedOutput, delegations } = extractDelegations(result.output)
    let enqueued = 0
    try {
      enqueued = await enqueueDelegations(protocol, delegations)
      if (enqueued > 0)
        await protocol.appendTaskLog(`agent:delegate count=${enqueued}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await protocol.appendTaskLog(`agent:delegate failed error=${message}`)
    }

    if (cleanedOutput.trim()) {
      await protocol.addChatMessage({
        id: shortId(),
        role: 'agent',
        text: cleanedOutput.trim(),
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

const MAX_INPUT_CHARS = 800
const MAX_HISTORY_CHARS = 300
const MAX_HISTORY_MESSAGES = 4
const MAX_HISTORY_KEYWORDS = 4
const HISTORY_FALLBACK_MESSAGES = 2
const MAX_TASK_RESULTS = 2
const MAX_TASK_RESULT_CHARS = 400
const MAX_KEYWORDS = 6
const HISTORY_FETCH_LIMIT = MAX_HISTORY_MESSAGES * 2
const MAX_DELEGATIONS = 3
const MAX_DELEGATION_PROMPT_CHARS = 1200

const truncate = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text
  if (maxChars <= 3) return text.slice(0, maxChars)
  return `${text.slice(0, maxChars - 3)}...`
}

const LATIN_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'up',
  'out',
  'about',
  'into',
  'over',
  'after',
  'before',
  'between',
  'among',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'can',
  'could',
  'should',
  'would',
  'may',
  'might',
  'will',
  'shall',
  'not',
  'no',
  'yes',
  'if',
  'then',
  'else',
  'when',
  'where',
  'why',
  'how',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'you',
  'he',
  'she',
  'they',
  'we',
  'them',
  'us',
  'my',
  'your',
  'our',
  'their',
  'me',
  'his',
  'her',
  'as',
  'but',
  'so',
  'than',
  'too',
  'very',
  'also',
  'just',
  'via',
  'per',
  'please',
  'pls',
  'plz',
])

const TOKEN_PATTERN = /[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/gi

const isLatinToken = (token: string): boolean => /[a-z0-9_]/i.test(token)

type TokenStat = {
  count: number
  firstIndex: number
  length: number
  kind: 'latin' | 'cjk'
}

const extractKeywords = (inputs: UserInput[]): string[] => {
  const text = inputs.map((i) => i.text).join(' ')
  if (!text) return []
  const stats = new Map<string, TokenStat>()
  let index = 0

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const raw = match[0]
    const position = index
    index += 1
    const latin = isLatinToken(raw)
    const token = latin ? raw.toLowerCase() : raw

    if (latin) {
      if (LATIN_STOPWORDS.has(token)) continue
      if (/^_+$/.test(token)) continue
      if (/^\d+$/.test(token) && token.length < 4) continue
    }

    const existing = stats.get(token)
    if (existing) {
      existing.count += 1
      continue
    }

    stats.set(token, {
      count: 1,
      firstIndex: position,
      length: token.length,
      kind: latin ? 'latin' : 'cjk',
    })
  }

  if (stats.size === 0) return []

  const scored: Array<{
    token: string
    score: number
    length: number
    index: number
  }> = []

  for (const [token, stat] of stats) {
    if (stat.length <= 2 && stat.count < 2) continue

    let score = stat.count
    if (stat.kind === 'latin') {
      if (stat.length >= 6) score += 1
      if (stat.length >= 10) score += 1
      if (token.includes('_')) score += 1
      if (/^\d+$/.test(token)) score -= 1
    } else score += Math.max(0, stat.length - 2)

    scored.push({
      token,
      score,
      length: stat.length,
      index: stat.firstIndex,
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.length !== a.length) return b.length - a.length
    return a.index - b.index
  })

  return scored.slice(0, MAX_KEYWORDS).map((item) => item.token)
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
  const inputIds = new Set(inputs.map((i) => i.id))
  const inputSet = new Set(inputs.map((i) => `${i.createdAt}|${i.text}`))
  const deduped = history.filter((msg) => {
    if (msg.role !== 'user') return true
    if (inputIds.has(msg.id)) return false
    return !inputSet.has(`${msg.createdAt}|${msg.text}`)
  })
  if (deduped.length === 0) return []
  const historyKeywords = keywords
    .filter((keyword) => !isLatinToken(keyword) || keyword.length >= 3)
    .slice(0, MAX_HISTORY_KEYWORDS)
  if (historyKeywords.length === 0)
    return deduped.slice(-HISTORY_FALLBACK_MESSAGES)
  const filtered = deduped.filter((msg) => {
    const lower = msg.text.toLowerCase()
    return historyKeywords.some((keyword) => {
      if (isLatinToken(keyword)) return lower.includes(keyword)
      return msg.text.includes(keyword)
    })
  })
  if (filtered.length === 0) return deduped.slice(-HISTORY_FALLBACK_MESSAGES)
  return filtered.slice(-MAX_HISTORY_MESSAGES)
}

const sortTaskResults = (results: TaskResult[]): TaskResult[] =>
  results.slice().sort((a, b) => {
    const ta = Date.parse(a.completedAt) || 0
    const tb = Date.parse(b.completedAt) || 0
    return ta - tb
  })

const buildPrompt = (
  stateDir: string,
  context: AgentContext,
  keywords: string[],
): string => {
  const parts: string[] = []
  const hasUserInputs = context.userInputs.length > 0

  // Core prompt always included
  parts.push(CORE_PROMPT)

  // Task delegation section for first awake (not resume)
  parts.push(TASK_DELEGATION_SECTION(stateDir))

  // Memory section only if we have memory hits
  if (context.memoryHits) parts.push(MEMORY_SECTION)

  // Self-awake section only if self-awake mode
  if (context.isSelfAwake) parts.push(SELF_AWAKE_SECTION)

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

const buildResumePrompt = (context: AgentContext): string => {
  const parts: string[] = []
  const hasUserInputs = context.userInputs.length > 0

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

  if (!hasUserInputs && context.taskResults.length === 0)
    parts.push('(No new inputs or task results)')

  return parts.join('\n')
}

type DelegationSpec = {
  prompt?: unknown
}

const DELEGATION_BLOCK_PATTERN = /```delegations\s*([\s\S]*?)```/i

const extractDelegations = (
  output: string,
): {
  cleanedOutput: string
  delegations: DelegationSpec[]
} => {
  const match = output.match(DELEGATION_BLOCK_PATTERN)
  if (match?.index === undefined)
    return { cleanedOutput: output, delegations: [] }

  const jsonText = match[1]?.trim() ?? ''
  if (!jsonText) return { cleanedOutput: output, delegations: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { cleanedOutput: output, delegations: [] }
  }

  if (!Array.isArray(parsed)) return { cleanedOutput: output, delegations: [] }

  const before = output.slice(0, match.index)
  const after = output.slice(match.index + match[0].length)
  const cleaned = `${before}\n${after}`.trim()
  return { cleanedOutput: cleaned, delegations: parsed as DelegationSpec[] }
}

const normalizeDelegationPrompt = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return truncate(trimmed, MAX_DELEGATION_PROMPT_CHARS)
}

const enqueueDelegations = async (
  protocol: Protocol,
  delegations: DelegationSpec[],
): Promise<number> => {
  if (delegations.length === 0) return 0
  const prompts: string[] = []
  const seen = new Set<string>()

  for (const item of delegations) {
    const prompt = normalizeDelegationPrompt(item.prompt)
    if (!prompt || seen.has(prompt)) continue
    seen.add(prompt)
    prompts.push(prompt)
    if (prompts.length >= MAX_DELEGATIONS) break
  }

  if (prompts.length === 0) return 0

  const now = new Date().toISOString()
  const tasks: PendingTask[] = prompts.map((prompt) => ({
    id: shortId(),
    prompt,
    createdAt: now,
  }))

  for (const task of tasks) await protocol.addPendingTask(task)
  return tasks.length
}
