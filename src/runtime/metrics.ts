import fs from 'node:fs/promises'

import { appendFile } from '../utils/fs.js'

export type MetricStatus = 'done' | 'failed'

export type MetricRecord = {
  taskId: string
  runId: string
  sessionKey: string
  status: MetricStatus
  attempt: number
  startedAt: string
  finishedAt: string
  durationMs: number
  score?: number
  minScore?: number
  changedFiles?: number
  changedLines?: number
  error?: string
}

export type MetricsSummary = {
  total: number
  done: number
  failed: number
  successRate: number
  avgDurationMs: number
  avgScore?: number
  lastRunAt?: string
}

const emptySummary = (): MetricsSummary => ({
  total: 0,
  done: 0,
  failed: 0,
  successRate: 0,
  avgDurationMs: 0,
})

const parseMetric = (line: string): MetricRecord | null => {
  if (!line.trim()) return null
  try {
    const parsed = JSON.parse(line) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const { status } = record
    if (
      typeof record.taskId !== 'string' ||
      typeof record.runId !== 'string' ||
      typeof record.sessionKey !== 'string' ||
      (status !== 'done' && status !== 'failed') ||
      typeof record.startedAt !== 'string' ||
      typeof record.finishedAt !== 'string' ||
      typeof record.durationMs !== 'number'
    )
      return null
    return record as MetricRecord
  } catch {
    return null
  }
}

export const appendMetric = async (
  metricsPath: string,
  record: MetricRecord,
): Promise<void> => {
  await appendFile(metricsPath, `${JSON.stringify(record)}\n`)
}

export const summarizeMetrics = async (
  metricsPath: string,
): Promise<MetricsSummary> => {
  let content = ''
  try {
    content = await fs.readFile(metricsPath, 'utf8')
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return emptySummary()
    throw error
  }

  const summary = emptySummary()
  let durationTotal = 0
  let scoreTotal = 0
  let scoreCount = 0
  let latestTimestamp = 0
  let latestIso: string | undefined

  for (const rawLine of content.split('\n')) {
    const record = parseMetric(rawLine)
    if (!record) continue
    summary.total += 1
    if (record.status === 'done') summary.done += 1
    else summary.failed += 1
    if (Number.isFinite(record.durationMs)) durationTotal += record.durationMs
    if (record.score !== undefined && Number.isFinite(record.score)) {
      scoreTotal += record.score
      scoreCount += 1
    }
    const finishedAtMs = Date.parse(record.finishedAt)
    if (Number.isFinite(finishedAtMs) && finishedAtMs >= latestTimestamp) {
      latestTimestamp = finishedAtMs
      latestIso = record.finishedAt
    }
  }

  if (summary.total > 0) {
    summary.successRate = summary.done / summary.total
    summary.avgDurationMs = Math.round(durationTotal / summary.total)
  }
  if (scoreCount > 0) summary.avgScore = scoreTotal / scoreCount
  if (latestIso) summary.lastRunAt = latestIso

  return summary
}
