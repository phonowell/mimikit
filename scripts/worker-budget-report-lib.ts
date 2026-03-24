import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { DEFAULT_WORKER_BUDGET_DURATION_MS } from '../src/execution/worker/profiled-runner-budget.js'
import { buildPaths, ensureDir } from '../src/persistence/fs/paths.js'
import { readJsonl } from '../src/persistence/storage/jsonl.js'

import type { JsonPacket, TaskResult } from '../src/foundation/types/index.js'

type LogRow = {
  event?: string
  status?: string
  stopReason?: string
}

export type DurationSummary = {
  count: number
  minMs: number | null
  p50Ms: number | null
  p75Ms: number | null
  p90Ms: number | null
  p95Ms: number | null
  maxMs: number | null
}

export type BudgetReport = {
  source: {
    workDir: string
    resultsPath: string
    logPath: string
  }
  defaults: {
    currentMaxDurationMs: number
    currentMaxRounds: number
  }
  totals: {
    results: number
    budgetPartial: number
    resumed: number
  }
  durations: DurationSummary
  thresholds: {
    ge10m: number
    ge20m: number
    ge30m: number
  }
  recommendation: {
    recommendedMaxDurationMs: number
    recommendedMaxRounds: number
    rationale: string[]
  }
}

const percentile = (durations: number[], ratio: number): number | null => {
  if (durations.length === 0) return null
  const index = Math.min(
    durations.length - 1,
    Math.floor((durations.length - 1) * ratio),
  )
  return durations[index] ?? null
}

const buildDurationSummary = (durations: number[]): DurationSummary => {
  const sorted = [...durations].sort((left, right) => left - right)
  return {
    count: sorted.length,
    minMs: sorted[0] ?? null,
    p50Ms: percentile(sorted, 0.5),
    p75Ms: percentile(sorted, 0.75),
    p90Ms: percentile(sorted, 0.9),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? null,
  }
}

const countAtOrAbove = (durations: number[], thresholdMs: number): number =>
  durations.filter((item) => item >= thresholdMs).length

const roundUpToMinutes = (valueMs: number, stepMinutes: number): number => {
  const stepMs = stepMinutes * 60 * 1000
  return Math.ceil(valueMs / stepMs) * stepMs
}

const recommendBudgetDurationMs = (summary: DurationSummary): number => {
  const p90Ms = summary.p90Ms
  if (p90Ms === null) return DEFAULT_WORKER_BUDGET_DURATION_MS
  if (p90Ms <= DEFAULT_WORKER_BUDGET_DURATION_MS)
    return DEFAULT_WORKER_BUDGET_DURATION_MS
  const padded = Math.ceil(p90Ms * 1.25)
  return Math.min(roundUpToMinutes(padded, 5), 30 * 60 * 1000)
}

const loadLogRows = async (path: string): Promise<LogRow[]> => {
  try {
    const raw = await readFile(path, 'utf8')
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as LogRow
        } catch {
          return {}
        }
      })
  } catch {
    return []
  }
}

export const buildReport = async (workDir: string): Promise<BudgetReport> => {
  const paths = buildPaths(workDir)
  const packets = await readJsonl<JsonPacket<TaskResult>>(paths.resultsPackets, {
    ensureFile: true,
  })
  const logRows = await loadLogRows(paths.log)
  const results = packets.map((packet) => packet.payload).filter(Boolean)
  const durations = results
    .map((item) => item.durationMs)
    .filter((value): value is number => typeof value === 'number')
  const durationSummary = buildDurationSummary(durations)
  const budgetPartial = results.filter(
    (item) =>
      item.status === 'partial' || item.stopReason === 'budget_exhausted',
  ).length
  const resumed = logRows.filter((row) => row.event === 'task_resumed').length
  const recommendedMaxDurationMs = recommendBudgetDurationMs(durationSummary)
  const rationale = [
    `sample_count=${results.length}`,
    durationSummary.p90Ms === null
      ? 'p90_unavailable_keep_default'
      : `p90_ms=${durationSummary.p90Ms}`,
    budgetPartial === 0
      ? 'no_budget_partial_observed_in_current_sample'
      : `budget_partial=${budgetPartial}`,
    recommendedMaxDurationMs === DEFAULT_WORKER_BUDGET_DURATION_MS
      ? 'keep_default_duration'
      : `raise_duration_to_${Math.round(recommendedMaxDurationMs / 60000)}m`,
  ]

  return {
    source: {
      workDir,
      resultsPath: paths.resultsPackets,
      logPath: paths.log,
    },
    defaults: {
      currentMaxDurationMs: DEFAULT_WORKER_BUDGET_DURATION_MS,
      currentMaxRounds: 3,
    },
    totals: {
      results: results.length,
      budgetPartial,
      resumed,
    },
    durations: durationSummary,
    thresholds: {
      ge10m: countAtOrAbove(durations, 10 * 60 * 1000),
      ge20m: countAtOrAbove(durations, 20 * 60 * 1000),
      ge30m: countAtOrAbove(durations, 30 * 60 * 1000),
    },
    recommendation: {
      recommendedMaxDurationMs,
      recommendedMaxRounds: 3,
      rationale,
    },
  }
}

export const writeSampleReport = async (
  workDir: string,
  report: BudgetReport,
): Promise<string> => {
  const outputDir = resolve(workDir, 'generated', 'worker-budget-report')
  await ensureDir(outputDir)
  const outputPath = resolve(
    outputDir,
    `worker-budget-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return outputPath
}
