import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadReplaySuite } from '../eval/replay-loader.js'
import { writeReplayReportJson } from '../eval/replay-report.js'
import { runReplaySuite } from '../eval/replay-runner.js'

import { decidePromptPromotion, type PromotionPolicy } from './decision.js'
import { validatePromptCandidate } from './prompt-guard.js'
import { optimizeManagerPrompt, restorePrompt } from './prompt-optimizer.js'

export type RunSelfEvolveRoundParams = {
  suitePath: string
  outDir: string
  stateDir: string
  workDir: string
  promptPath: string
  timeoutMs: number
  promotionPolicy?: PromotionPolicy
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
  guard?: {
    ok: boolean
    reason: string
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
  const guard = validatePromptCandidate(optimized.original, optimized.candidate)
  if (!guard.ok) {
    await restorePrompt(params.promptPath, optimized.original)
    const decisionPath = await writeDecision(params.outDir, {
      suite: suite.suite,
      promptPath: params.promptPath,
      promote: false,
      reason: `guard_reject:${guard.reason}`,
      guard,
      baseline: {
        passRate: baseline.passRate,
        usageTotal: baseline.metrics.usage.total,
        llmElapsedMs: baseline.metrics.llmElapsedMs,
      },
      candidate: {
        passRate: baseline.passRate,
        usageTotal: baseline.metrics.usage.total,
        llmElapsedMs: baseline.metrics.llmElapsedMs,
      },
      reportPaths: {
        baseline: baselinePath,
        candidate: baselinePath,
      },
    })
    return {
      suite: suite.suite,
      promptPath: params.promptPath,
      promote: false,
      reason: `guard_reject:${guard.reason}`,
      baseline: {
        passRate: baseline.passRate,
        usageTotal: baseline.metrics.usage.total,
        llmElapsedMs: baseline.metrics.llmElapsedMs,
      },
      candidate: {
        passRate: baseline.passRate,
        usageTotal: baseline.metrics.usage.total,
        llmElapsedMs: baseline.metrics.llmElapsedMs,
      },
      reportPaths: {
        baseline: baselinePath,
        candidate: baselinePath,
      },
      guard,
      decisionPath,
    }
  }

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

  const decisionWithPolicy = decidePromptPromotion(
    baseline,
    candidate,
    params.promotionPolicy,
  )
  if (!decisionWithPolicy.promote)
    await restorePrompt(params.promptPath, optimized.original)

  const decisionPayload = {
    suite: suite.suite,
    promptPath: params.promptPath,
    promote: decisionWithPolicy.promote,
    reason: decisionWithPolicy.reason,
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
    guard,
  }
  const decisionPath = await writeDecision(params.outDir, decisionPayload)
  return {
    suite: suite.suite,
    promptPath: params.promptPath,
    promote: decisionWithPolicy.promote,
    reason: decisionWithPolicy.reason,
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
    guard,
    decisionPath,
  }
}
