import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { appendAudit, getGitDiffSummary } from './audit.js'
import { execCodex } from './codex.js'
import {
  commitAll,
  createBranch,
  getDiffPatch,
  getStatusPorcelain,
  isGitRepo,
  stashDrop,
  stashPop,
  stashPush,
} from './git.js'
import { shortId } from './id.js'
import { formatMemoryHits, type MemoryConfig, searchMemory } from './memory.js'
import {
  CORE_PROMPT,
  MEMORY_SECTION,
  SELF_AWAKE_SECTION,
  SOUL_PROMPT,
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

type SelfAwakeRun = {
  state: SelfAwakeState | null
  allowDelegation: boolean
  active: boolean
}

export const runAgent = async (
  config: AgentConfig,
  protocol: Protocol,
  context: Omit<AgentContext, 'chatHistory' | 'memoryHits'>,
): Promise<void> => {
  const state = await protocol.getAgentState()
  const { sessionId } = state
  const isResume = !!sessionId
  const selfAwake = context.isSelfAwake
    ? await prepareSelfAwakeRun(config)
    : { state: null, allowDelegation: true, active: false }

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
      const allowDelegation = !context.isSelfAwake || selfAwake.allowDelegation
      const effectiveDelegations = allowDelegation ? delegations : []
      const delegationOptions: {
        maxDelegations: number
        origin: 'self-awake' | 'event'
        selfAwakeRunId?: string
      } = {
        maxDelegations: context.isSelfAwake
          ? SELF_AWAKE_MAX_DELEGATIONS
          : MAX_DELEGATIONS,
        origin: context.isSelfAwake ? 'self-awake' : 'event',
        ...(selfAwake.state?.runId === undefined
          ? {}
          : { selfAwakeRunId: selfAwake.state.runId }),
      }
      const tasks = await enqueueDelegations(
        protocol,
        effectiveDelegations,
        delegationOptions,
      )
      enqueued = tasks.length
      if (context.isSelfAwake && !allowDelegation && delegations.length > 0) {
        const runId = selfAwake.state?.runId
        await appendAudit(config.stateDir, {
          ts: new Date().toISOString(),
          action: 'self-awake:skip-delegation',
          trigger: 'self-awake',
          detail: 'delegation blocked',
          diff: await getGitDiffSummary(config.workDir),
          ...withOptional('runId', runId),
        })
      }
      const firstTask = tasks[0]
      if (context.isSelfAwake && firstTask && selfAwake.state) {
        await saveSelfAwakeState(config.stateDir, {
          ...selfAwake.state,
          status: 'delegated',
          taskId: firstTask.id,
          updatedAt: new Date().toISOString(),
        })
        await appendAudit(config.stateDir, {
          ts: new Date().toISOString(),
          action: 'self-awake:delegate',
          trigger: 'self-awake',
          taskId: firstTask.id,
          runId: selfAwake.state.runId,
          detail: truncate(firstTask.prompt, 200),
          diff: await getGitDiffSummary(config.workDir),
        })
      }
      if (context.isSelfAwake && tasks.length === 0 && selfAwake.state) {
        await saveSelfAwakeState(config.stateDir, {
          ...selfAwake.state,
          status: selfAwake.active ? selfAwake.state.status : 'no-action',
          updatedAt: new Date().toISOString(),
        })
      }
      if (enqueued > 0)
        await protocol.appendTaskLog(`agent:delegate count=${enqueued}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await protocol.appendTaskLog(`agent:delegate failed error=${message}`)
    }

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
const SELF_AWAKE_MAX_DELEGATIONS = 1
const SELF_AWAKE_STATE_FILE = 'self_awake.json'
const REVIEW_DIFF_MAX_CHARS = 8000
const REVIEW_TIMEOUT_MS = 4 * 60 * 1000

type SelfAwakeStateStatus =
  | 'started'
  | 'delegated'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'rolled-back'
  | 'reviewed'
  | 'committed'
  | 'no-action'

type SelfAwakeState = {
  runId: string
  startedAt: string
  status: SelfAwakeStateStatus
  stashRef?: string
  stashMessage?: string
  taskId?: string
  updatedAt?: string
}

const truncate = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text
  if (maxChars <= 3) return text.slice(0, maxChars)
  return `${text.slice(0, maxChars - 3)}...`
}

const withOptional = <T extends string, V>(
  key: T,
  value: V | undefined,
): Partial<Record<T, V>> => {
  if (value === undefined) return {}
  const entry: Partial<Record<T, V>> = {}
  entry[key] = value
  return entry
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
  parts.push(SOUL_PROMPT)
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

  return parts.join('\n')
}

const buildResumePrompt = (context: AgentContext): string => {
  const parts: string[] = []
  const hasUserInputs = context.userInputs.length > 0

  if (context.isSelfAwake) parts.push(SELF_AWAKE_SECTION)

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
  options?: {
    maxDelegations?: number
    origin?: PendingTask['origin']
    selfAwakeRunId?: string
  },
): Promise<PendingTask[]> => {
  if (delegations.length === 0) return []
  const prompts: string[] = []
  const seen = new Set<string>()
  const maxDelegations = options?.maxDelegations ?? MAX_DELEGATIONS

  for (const item of delegations) {
    const prompt = normalizeDelegationPrompt(item.prompt)
    if (!prompt || seen.has(prompt)) continue
    seen.add(prompt)
    prompts.push(prompt)
    if (prompts.length >= maxDelegations) break
  }

  if (prompts.length === 0) return []

  const now = new Date().toISOString()
  const tasks: PendingTask[] = prompts.map((prompt) => ({
    id: shortId(),
    prompt,
    createdAt: now,
    ...(options?.origin === undefined ? {} : { origin: options.origin }),
    ...(options?.selfAwakeRunId === undefined
      ? {}
      : { selfAwakeRunId: options.selfAwakeRunId }),
  }))

  for (const task of tasks) await protocol.addPendingTask(task)
  return tasks
}

const selfAwakeStatePath = (stateDir: string): string =>
  join(stateDir, SELF_AWAKE_STATE_FILE)

const readSelfAwakeState = async (
  stateDir: string,
): Promise<SelfAwakeState | null> => {
  try {
    const data = await readFile(selfAwakeStatePath(stateDir), 'utf-8')
    return JSON.parse(data) as SelfAwakeState
  } catch {
    return null
  }
}

const saveSelfAwakeState = async (
  stateDir: string,
  state: SelfAwakeState,
): Promise<void> => {
  await mkdir(stateDir, { recursive: true })
  await writeFile(selfAwakeStatePath(stateDir), JSON.stringify(state, null, 2))
}

const formatTimestamp = (date = new Date()): string =>
  date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')

const prepareSelfAwakeRun = async (
  config: AgentConfig,
): Promise<SelfAwakeRun> => {
  try {
    const existing = await readSelfAwakeState(config.stateDir)
    if (existing?.status === 'delegated' && existing.taskId) {
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:active',
        trigger: 'self-awake',
        taskId: existing.taskId,
        runId: existing.runId,
        diff: await getGitDiffSummary(config.workDir),
      })
      return { state: existing, allowDelegation: false, active: true }
    }

    const now = new Date()
    const runId = `${formatTimestamp(now)}-${shortId()}`
    const stashMessage = `self-awake-${formatTimestamp(now)}`
    let allowDelegation = true
    let status: SelfAwakeStateStatus = 'started'
    let stashRef: string | undefined
    let detail = ''

    if (!(await isGitRepo(config.workDir))) {
      allowDelegation = false
      status = 'blocked'
      detail = 'not a git repo'
    } else {
      const stash = await stashPush(config.workDir, stashMessage)
      if (!stash.ok) {
        allowDelegation = false
        status = 'blocked'
        detail = truncate(`${stash.stderr}${stash.stdout}`, 200)
      } else if (!stash.noChanges) stashRef = stash.stashRef
    }

    const state: SelfAwakeState = {
      runId,
      startedAt: now.toISOString(),
      status,
      stashMessage,
      updatedAt: now.toISOString(),
      ...withOptional('stashRef', stashRef),
    }

    await saveSelfAwakeState(config.stateDir, state)
    await appendAudit(config.stateDir, {
      ts: now.toISOString(),
      action: 'self-awake:start',
      trigger: 'self-awake',
      runId,
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('detail', detail ? detail : undefined),
    })

    return { state, allowDelegation, active: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:start-failed',
        trigger: 'self-awake',
        detail: truncate(message, 200),
        diff: await getGitDiffSummary(config.workDir),
      })
    } catch {
      // ignore audit failure
    }
    return { state: null, allowDelegation: false, active: false }
  }
}

const hasWorkingChanges = async (workDir: string): Promise<boolean> => {
  const status = await getStatusPorcelain(workDir)
  return status.trim().length > 0
}

const reviewSelfAwakeChanges = async (
  config: AgentConfig,
): Promise<{ pass: boolean; summary: string }> => {
  const status = await getStatusPorcelain(config.workDir)
  const diff = await getDiffPatch(config.workDir, REVIEW_DIFF_MAX_CHARS)
  if (!status.trim() && !diff.trim())
    return { pass: true, summary: 'no changes' }

  const prompt = buildReviewPrompt(status, diff)
  const result = await execCodex({
    prompt,
    workDir: config.workDir,
    model: config.model,
    timeout: Math.min(config.timeout ?? 10 * 60 * 1000, REVIEW_TIMEOUT_MS),
  })
  const output = result.output.trim()
  const pass = parseReviewDecision(output) === 'pass'
  return { pass, summary: truncate(output || 'no output', 400) }
}

const parseReviewDecision = (output: string): 'pass' | 'fail' => {
  const upper = output.toUpperCase()
  if (upper.includes('REVIEW: FAIL')) return 'fail'
  if (upper.includes('REVIEW: PASS')) return 'pass'
  return 'fail'
}

const buildReviewPrompt = (status: string, diff: string): string => {
  const statusBlock = status.trim() ? status.trim() : '(clean)'
  const diffBlock = diff.trim() ? diff.trim() : '(no diff)'
  return [
    'Review the code changes and output exactly one of:',
    'REVIEW: PASS',
    'REVIEW: FAIL',
    'If FAIL, add up to 3 short bullet reasons. Do not modify files.',
    'Git status:',
    '```',
    statusBlock,
    '```',
    'Diff:',
    '```diff',
    diffBlock,
    '```',
  ].join('\\n')
}

const commitSelfAwakeChanges = async (
  config: AgentConfig,
): Promise<{ ok: boolean; branch?: string; error?: string }> => {
  if (!(await hasWorkingChanges(config.workDir)))
    return { ok: false, error: 'no changes' }
  const timestamp = formatTimestamp()
  const branchBase = `self-improve/${timestamp}`
  const branchResult = await createBranch(config.workDir, branchBase)
  if (!branchResult.ok) {
    return {
      ok: false,
      error: truncate(
        `${branchResult.result.stderr}${branchResult.result.stdout}`,
        300,
      ),
    }
  }
  const commitResult = await commitAll(
    config.workDir,
    `self-improve: ${timestamp}`,
  )
  if (commitResult.code !== 0) {
    return {
      ok: false,
      branch: branchResult.name,
      error: truncate(`${commitResult.stderr}${commitResult.stdout}`, 300),
    }
  }
  return { ok: true, branch: branchResult.name }
}

const rollbackSelfAwake = async (
  config: AgentConfig,
  state: SelfAwakeState | null,
  runId: string | undefined,
  reason: string,
): Promise<void> => {
  const fallbackRun = runId ?? formatTimestamp()
  const failedStash = await stashPush(
    config.workDir,
    `self-awake-failed-${fallbackRun}`,
  )
  let detail = reason
  let popOk = true
  if (!failedStash.ok) detail = `${detail}; stash failed`
  if (state?.stashRef) {
    const popResult = await stashPop(config.workDir, state.stashRef)
    if (popResult.code !== 0) {
      popOk = false
      detail = `${detail}; stash pop failed: ${truncate(
        `${popResult.stderr}${popResult.stdout}`,
        200,
      )}`
    }
  }
  if (failedStash.stashRef && popOk)
    await stashDrop(config.workDir, failedStash.stashRef)

  await appendAudit(config.stateDir, {
    ts: new Date().toISOString(),
    action: 'self-awake:rollback',
    trigger: 'self-awake',
    detail: truncate(detail, 300),
    diff: await getGitDiffSummary(config.workDir),
    ...withOptional('runId', runId),
  })
}

const handleSelfAwakeTaskResults = async (
  config: AgentConfig,
  results: TaskResult[],
): Promise<void> => {
  const selfAwakeResults = results.filter(
    (result) => result.origin === 'self-awake' || result.selfAwakeRunId,
  )
  if (selfAwakeResults.length === 0) return

  const state = await readSelfAwakeState(config.stateDir)

  for (const result of selfAwakeResults) {
    const runId = result.selfAwakeRunId ?? state?.runId
    await appendAudit(config.stateDir, {
      ts: new Date().toISOString(),
      action: 'self-awake:task-result',
      trigger: 'self-awake',
      taskId: result.id,
      detail: truncate(result.error ?? result.status, 200),
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('runId', runId),
    })

    const baseState: SelfAwakeState = state ?? {
      runId: runId ?? formatTimestamp(),
      startedAt: new Date().toISOString(),
      status: 'started',
    }

    if (result.status === 'failed') {
      await rollbackSelfAwake(
        config,
        state ?? baseState,
        runId,
        result.error ?? 'task failed',
      )
      await saveSelfAwakeState(config.stateDir, {
        ...baseState,
        status: 'rolled-back',
        taskId: result.id,
        updatedAt: new Date().toISOString(),
      })
      continue
    }

    if (!(await hasWorkingChanges(config.workDir))) {
      await saveSelfAwakeState(config.stateDir, {
        ...baseState,
        status: 'completed',
        taskId: result.id,
        updatedAt: new Date().toISOString(),
      })
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:no-changes',
        trigger: 'self-awake',
        taskId: result.id,
        diff: await getGitDiffSummary(config.workDir),
        ...withOptional('runId', runId),
      })
      continue
    }

    const review = await reviewSelfAwakeChanges(config)
    await appendAudit(config.stateDir, {
      ts: new Date().toISOString(),
      action: 'self-awake:review',
      trigger: 'self-awake',
      taskId: result.id,
      detail: review.summary,
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('runId', runId),
    })
    if (!review.pass) {
      await rollbackSelfAwake(
        config,
        state ?? baseState,
        runId,
        'review failed',
      )
      await saveSelfAwakeState(config.stateDir, {
        ...baseState,
        status: 'rolled-back',
        taskId: result.id,
        updatedAt: new Date().toISOString(),
      })
      continue
    }

    await saveSelfAwakeState(config.stateDir, {
      ...baseState,
      status: 'reviewed',
      taskId: result.id,
      updatedAt: new Date().toISOString(),
    })

    const commit = await commitSelfAwakeChanges(config)
    if (!commit.ok || !commit.branch) {
      await saveSelfAwakeState(config.stateDir, {
        ...baseState,
        status: 'reviewed',
        taskId: result.id,
        updatedAt: new Date().toISOString(),
      })
      await appendAudit(config.stateDir, {
        ts: new Date().toISOString(),
        action: 'self-awake:commit-failed',
        trigger: 'self-awake',
        taskId: result.id,
        diff: await getGitDiffSummary(config.workDir),
        ...withOptional('runId', runId),
        ...withOptional('detail', commit.error ?? 'missing branch'),
      })
      continue
    }

    const commitBranch = commit.branch
    await saveSelfAwakeState(config.stateDir, {
      ...baseState,
      status: 'committed',
      taskId: result.id,
      updatedAt: new Date().toISOString(),
    })
    await appendAudit(config.stateDir, {
      ts: new Date().toISOString(),
      action: 'self-awake:commit',
      trigger: 'self-awake',
      taskId: result.id,
      detail: commitBranch,
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('runId', runId),
    })
    await appendAudit(config.stateDir, {
      ts: new Date().toISOString(),
      action: 'self-awake:mr',
      trigger: 'self-awake',
      taskId: result.id,
      detail: 'pending',
      diff: await getGitDiffSummary(config.workDir),
      ...withOptional('runId', runId),
    })
  }
}
