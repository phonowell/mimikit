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
  output: string
  commandStats: Record<string, number>
  assertions: ReplayAssertionResult[]
  error?: string
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

const resolveArchiveOutput = async (
  params: ReplayCaseRunParams,
): Promise<{ hit: boolean; output?: string }> => {
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
  return { hit: true, output: hit.output }
}

const runOnlineManager = async (
  params: ReplayCaseRunParams,
): Promise<string> => {
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
  return result.output
}

export const runReplayCase = async (
  params: ReplayCaseRunParams,
): Promise<ReplayCaseRunResult> => {
  try {
    const archiveResult = await resolveArchiveOutput(params)
    let managerOutput = archiveResult.output ?? ''
    if (!archiveResult.hit) {
      if (params.offline) {
        throw new Error(
          `[replay:eval] offline archive miss: case=${params.replayCase.id} model=${params.model ?? 'default'} archiveDir=${params.archiveDir}`,
        )
      }
      managerOutput = await runOnlineManager(params)
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
      output,
      commandStats,
      assertions,
    }
  } catch (error) {
    return {
      status: 'error',
      output: '',
      commandStats: {},
      assertions: [],
      error: toErrorMessage(error),
    }
  }
}
