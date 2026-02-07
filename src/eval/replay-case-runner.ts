import { buildManagerPrompt } from '../roles/prompt.js'
import { runManager } from '../roles/runner.js'
import { type LlmArchiveLookup } from '../storage/llm-archive.js'
import { parseCommands } from '../supervisor/command-parser.js'

import {
  findReplayArchiveRecord,
  type ReplayArchiveIndex,
} from './replay-archive.js'
import {
  buildReplayAssertions,
  buildReplayCommandStats,
} from './replay-assertions.js'

import type {
  ReplayAssertionResult,
  ReplayCase,
  ReplayCaseStatus,
} from './replay-types.js'
import type { TokenUsage } from '../types/index.js'

export type ReplayCaseRunParams = {
  replayCase: ReplayCase
  stateDir: string
  workDir: string
  timeoutMs: number
  model?: string
  seed?: number
  temperature?: number
  offline?: boolean
  archiveDir: string
  archiveIndex: ReplayArchiveIndex | null
}

export type ReplayCaseRunResult = {
  status: ReplayCaseStatus
  source: 'live' | 'archive'
  llmElapsedMs: number
  usage: TokenUsage
  output: string
  commandStats: Record<string, number>
  assertions: ReplayAssertionResult[]
  error?: string
}

const emptyUsage = (): TokenUsage => ({ input: 0, output: 0, total: 0 })

const mergeUsage = (usage?: TokenUsage): TokenUsage => {
  if (!usage) return emptyUsage()
  const input = typeof usage.input === 'number' ? usage.input : 0
  const output = typeof usage.output === 'number' ? usage.output : 0
  const total =
    typeof usage.total === 'number' ? usage.total : Math.max(0, input + output)
  return { input, output, total }
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

const resolveArchiveOutput = async (
  params: ReplayCaseRunParams,
): Promise<{
  hit: boolean
  output?: string
  usage?: TokenUsage
  elapsedMs?: number
}> => {
  if (!params.archiveIndex) return { hit: false }
  const prompt = await buildManagerPrompt({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.replayCase.inputs,
    results: params.replayCase.results,
    tasks: params.replayCase.tasks,
    history: params.replayCase.history,
  })
  const lookupPrimary: LlmArchiveLookup = {
    role: 'manager',
    attempt: 'primary',
    ...(params.model ? { model: params.model } : {}),
    prompt,
    messages: [{ role: 'user', content: prompt }],
    toolSchema: null,
    toolInputs: null,
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
  }
  const primaryHit = findReplayArchiveRecord(params.archiveIndex, lookupPrimary)
  const fallbackHit = primaryHit
    ? null
    : findReplayArchiveRecord(params.archiveIndex, {
        ...lookupPrimary,
        attempt: 'fallback',
      })
  const hit = primaryHit ?? fallbackHit
  if (!hit) return { hit: false }
  return {
    hit: true,
    output: hit.output,
    ...(hit.usage ? { usage: hit.usage } : {}),
    ...(hit.elapsedMs !== undefined ? { elapsedMs: hit.elapsedMs } : {}),
  }
}

const runOnlineManager = async (
  params: ReplayCaseRunParams,
): Promise<{ output: string; elapsedMs: number; usage: TokenUsage }> => {
  const result = await runManager({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.replayCase.inputs,
    results: params.replayCase.results,
    tasks: params.replayCase.tasks,
    history: params.replayCase.history,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
  })
  return {
    output: result.output,
    elapsedMs: result.elapsedMs,
    usage: mergeUsage(result.usage),
  }
}

export const runReplayCase = async (
  params: ReplayCaseRunParams,
): Promise<ReplayCaseRunResult> => {
  try {
    const archiveResult = await resolveArchiveOutput(params)
    let managerOutput = archiveResult.output ?? ''
    const source: 'live' | 'archive' = archiveResult.hit ? 'archive' : 'live'
    let llmElapsedMs = 0
    let usage = emptyUsage()
    if (!archiveResult.hit) {
      if (params.offline) {
        throw new Error(
          `[replay:eval] offline archive miss: case=${params.replayCase.id} model=${params.model ?? 'default'} archiveDir=${params.archiveDir}`,
        )
      }
      const liveResult = await runOnlineManager(params)
      managerOutput = liveResult.output
      llmElapsedMs = liveResult.elapsedMs
      usage = liveResult.usage
    } else {
      llmElapsedMs = archiveResult.elapsedMs ?? 0
      usage = mergeUsage(archiveResult.usage)
    }
    const parsed = parseCommands(managerOutput)
    const output = parsed.text
    const commandStats = buildReplayCommandStats(parsed.commands)
    const assertions = buildReplayAssertions({
      replayCase: params.replayCase,
      output,
      commandStats,
    })
    const hasFailedAssertion = assertions.some((assertion) => !assertion.passed)
    return {
      status: hasFailedAssertion ? 'failed' : 'passed',
      source,
      llmElapsedMs,
      usage,
      output,
      commandStats,
      assertions,
    }
  } catch (error) {
    return {
      status: 'error',
      source: 'live',
      llmElapsedMs: 0,
      usage: emptyUsage(),
      output: '',
      commandStats: {},
      assertions: [],
      error: toErrorMessage(error),
    }
  }
}
