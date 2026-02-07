import { resolve } from 'node:path'

import { loadReplaySuite } from '../eval/replay-loader.js'
import { runReplaySuite } from '../eval/replay-runner.js'

import type { ReplayReport, ReplaySuiteEntry } from '../eval/replay-types.js'

export type MultiSuiteParams = {
  suites: ReplaySuiteEntry[]
  stateDir: string
  workDir: string
  timeoutMs: number
  model?: string
}

export type MultiSuiteReport = {
  reports: Array<{
    path: string
    alias: string
    weight: number
    report: ReplayReport
  }>
  aggregate: {
    weightedPassRate: number
    weightedUsageTotal: number
    weightedLlmElapsedMs: number
    totalWeight: number
  }
}

const toAlias = (entry: ReplaySuiteEntry, index: number): string => {
  if (entry.alias) return entry.alias
  const slashIndex = Math.max(
    entry.path.lastIndexOf('/'),
    entry.path.lastIndexOf('\\'),
  )
  const filename =
    slashIndex >= 0 ? entry.path.slice(slashIndex + 1) : entry.path
  return filename || `suite-${index + 1}`
}

const normalizeWeight = (weight?: number): number =>
  typeof weight === 'number' && Number.isFinite(weight) && weight > 0
    ? weight
    : 1

export const runReplaySuitesAggregate = async (
  params: MultiSuiteParams,
): Promise<MultiSuiteReport> => {
  const reports: MultiSuiteReport['reports'] = []
  let weightedPassRate = 0
  let weightedUsageTotal = 0
  let weightedLlmElapsedMs = 0
  let totalWeight = 0
  for (let index = 0; index < params.suites.length; index += 1) {
    const entry = params.suites[index]
    if (!entry) continue
    const suitePath = resolve(entry.path)
    const suite = await loadReplaySuite(suitePath)
    const report = await runReplaySuite({
      suite,
      stateDir: params.stateDir,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      ...(params.model ? { model: params.model } : {}),
      maxFail: Number.MAX_SAFE_INTEGER,
    })
    const weight = normalizeWeight(entry.weight)
    reports.push({
      path: suitePath,
      alias: toAlias(entry, index),
      weight,
      report,
    })
    totalWeight += weight
    weightedPassRate += report.passRate * weight
    weightedUsageTotal += report.metrics.usage.total * weight
    weightedLlmElapsedMs += report.metrics.llmElapsedMs * weight
  }
  const safeWeight = totalWeight > 0 ? totalWeight : 1
  return {
    reports,
    aggregate: {
      weightedPassRate: Number((weightedPassRate / safeWeight).toFixed(6)),
      weightedUsageTotal: Number((weightedUsageTotal / safeWeight).toFixed(3)),
      weightedLlmElapsedMs: Number(
        (weightedLlmElapsedMs / safeWeight).toFixed(3),
      ),
      totalWeight,
    },
  }
}
