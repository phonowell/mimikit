import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { decideAggregatePromotion, type PromotionPolicy } from './decision.js'
import { runReplaySuitesAggregate } from './multi-suite.js'
import { validatePromptCandidate } from './prompt-guard.js'
import { optimizeManagerPrompt, restorePrompt } from './prompt-optimizer.js'

import type { ReplaySuiteEntry } from '../eval/replay-types.js'

export type RunSelfEvolveMultiRoundParams = {
  suites: ReplaySuiteEntry[]
  outDir: string
  stateDir: string
  workDir: string
  promptPath: string
  timeoutMs: number
  promotionPolicy?: PromotionPolicy
  model?: string
  optimizerModel?: string
}

export type SelfEvolveMultiRoundResult = {
  promote: boolean
  reason: string
  baseline: {
    weightedPassRate: number
    weightedUsageTotal: number
    weightedLlmElapsedMs: number
  }
  candidate: {
    weightedPassRate: number
    weightedUsageTotal: number
    weightedLlmElapsedMs: number
  }
  decisionPath: string
  guard?: {
    ok: boolean
    reason: string
  }
}

const writeJson = async (
  path: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export const runSelfEvolveMultiRound = async (
  params: RunSelfEvolveMultiRoundParams,
): Promise<SelfEvolveMultiRoundResult> => {
  const baseline = await runReplaySuitesAggregate({
    suites: params.suites,
    stateDir: params.stateDir,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
  })
  await writeJson(
    resolve(params.outDir, 'baseline-multi.json'),
    baseline as never,
  )

  const optimized = await optimizeManagerPrompt({
    stateDir: params.stateDir,
    workDir: params.workDir,
    promptPath: params.promptPath,
    timeoutMs: params.timeoutMs,
    ...(params.optimizerModel ? { model: params.optimizerModel } : {}),
  })
  const guard = validatePromptCandidate(optimized.original, optimized.candidate)
  if (!guard.ok) {
    await restorePrompt(params.promptPath, optimized.original)
    const decisionPath = resolve(params.outDir, 'decision-multi.json')
    const { aggregate } = baseline
    const payload = {
      promote: false,
      reason: `guard_reject:${guard.reason}`,
      guard,
      baseline: aggregate,
      candidate: aggregate,
    }
    await writeJson(decisionPath, payload)
    return {
      promote: false,
      reason: `guard_reject:${guard.reason}`,
      baseline: aggregate,
      candidate: aggregate,
      guard,
      decisionPath,
    }
  }

  const candidate = await runReplaySuitesAggregate({
    suites: params.suites,
    stateDir: params.stateDir,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
  })
  await writeJson(
    resolve(params.outDir, 'candidate-multi.json'),
    candidate as never,
  )

  const decision = decideAggregatePromotion(
    baseline.aggregate,
    candidate.aggregate,
    params.promotionPolicy,
  )
  if (!decision.promote)
    await restorePrompt(params.promptPath, optimized.original)

  const decisionPath = resolve(params.outDir, 'decision-multi.json')
  await writeJson(decisionPath, {
    promote: decision.promote,
    reason: decision.reason,
    baseline: baseline.aggregate,
    candidate: candidate.aggregate,
    guard,
  })
  return {
    promote: decision.promote,
    reason: decision.reason,
    baseline: baseline.aggregate,
    candidate: candidate.aggregate,
    guard,
    decisionPath,
  }
}
