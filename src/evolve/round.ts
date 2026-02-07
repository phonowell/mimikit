import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadReplaySuite } from '../eval/replay-loader.js'
import { writeReplayReportJson } from '../eval/replay-report.js'
import { runReplaySuite } from '../eval/replay-runner.js'

import { decidePromptPromotion } from './decision.js'
import { optimizeManagerPrompt, restorePrompt } from './prompt-optimizer.js'

export type RunSelfEvolveRoundParams = {
  suitePath: string
  outDir: string
  stateDir: string
  workDir: string
  promptPath: string
  timeoutMs: number
  model?: string
  optimizerModel?: string
}

export type SelfEvolveRoundResult = {
  suite: string
  promptPath: string
  promote: boolean
  reason: string
  baseline: {
    passRate: number
    usageTotal: number
    llmElapsedMs: number
  }
  candidate: {
    passRate: number
    usageTotal: number
    llmElapsedMs: number
  }
  reportPaths: {
    baseline: string
    candidate: string
  }
  decisionPath: string
}

const writeDecision = async (
  outDir: string,
  payload: Record<string, unknown>,
): Promise<string> => {
  const path = resolve(outDir, 'decision.json')
  await mkdir(resolve(outDir), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return path
}

export const runSelfEvolveRound = async (
  params: RunSelfEvolveRoundParams,
): Promise<SelfEvolveRoundResult> => {
  const suite = await loadReplaySuite(params.suitePath)
  const baseline = await runReplaySuite({
    suite,
    stateDir: params.stateDir,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
    maxFail: Number.MAX_SAFE_INTEGER,
  })
  const baselinePath = resolve(params.outDir, 'baseline.json')
  await writeReplayReportJson(baselinePath, baseline)

  const optimized = await optimizeManagerPrompt({
    stateDir: params.stateDir,
    workDir: params.workDir,
    promptPath: params.promptPath,
    timeoutMs: params.timeoutMs,
    ...(params.optimizerModel ? { model: params.optimizerModel } : {}),
  })

  const candidate = await runReplaySuite({
    suite,
    stateDir: params.stateDir,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
    maxFail: Number.MAX_SAFE_INTEGER,
  })
  const candidatePath = resolve(params.outDir, 'candidate.json')
  await writeReplayReportJson(candidatePath, candidate)

  const decision = decidePromptPromotion(baseline, candidate)
  if (!decision.promote)
    await restorePrompt(params.promptPath, optimized.original)

  const decisionPayload = {
    suite: suite.suite,
    promptPath: params.promptPath,
    promote: decision.promote,
    reason: decision.reason,
    baseline: {
      passRate: baseline.passRate,
      usageTotal: baseline.metrics.usage.total,
      llmElapsedMs: baseline.metrics.llmElapsedMs,
    },
    candidate: {
      passRate: candidate.passRate,
      usageTotal: candidate.metrics.usage.total,
      llmElapsedMs: candidate.metrics.llmElapsedMs,
    },
    reportPaths: {
      baseline: baselinePath,
      candidate: candidatePath,
    },
  }
  const decisionPath = await writeDecision(params.outDir, decisionPayload)
  return {
    suite: suite.suite,
    promptPath: params.promptPath,
    promote: decision.promote,
    reason: decision.reason,
    baseline: {
      passRate: baseline.passRate,
      usageTotal: baseline.metrics.usage.total,
      llmElapsedMs: baseline.metrics.llmElapsedMs,
    },
    candidate: {
      passRate: candidate.passRate,
      usageTotal: candidate.metrics.usage.total,
      llmElapsedMs: candidate.metrics.llmElapsedMs,
    },
    reportPaths: {
      baseline: baselinePath,
      candidate: candidatePath,
    },
    decisionPath,
  }
}
