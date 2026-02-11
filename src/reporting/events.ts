import { dirname, join, resolve } from 'node:path'

import { ensureDir } from '../fs/paths.js'
import { nowIso } from '../shared/utils.js'
import { appendJsonl, readJsonl } from '../storage/jsonl.js'

type ReportingSeverity = 'low' | 'medium' | 'high'

type ReportingCategory =
  | 'quality'
  | 'latency'
  | 'cost'
  | 'failure'
  | 'ux'
  | 'other'

type ReportingSource = 'runtime'

export type ReportingEvent = {
  id: string
  createdAt: string
  source: ReportingSource
  category: ReportingCategory
  severity: ReportingSeverity
  message: string
  note?: string
  taskId?: string
  elapsedMs?: number
  usageTotal?: number
}

const reportingDirPath = (stateDir: string): string =>
  resolve(join(stateDir, 'reporting'))

const reportingEventsPath = (stateDir: string): string =>
  resolve(join(reportingDirPath(stateDir), 'events.jsonl'))

export const dailyReportDirPath = (stateDir: string): string =>
  resolve(join(stateDir, 'reports', 'daily'))

export const dailyReportPath = (stateDir: string, day: string): string =>
  resolve(join(dailyReportDirPath(stateDir), `${day}.md`))

export const appendReportingEvent = async (params: {
  stateDir: string
  source: ReportingSource
  category: ReportingCategory
  severity: ReportingSeverity
  message: string
  note?: string
  taskId?: string
  elapsedMs?: number
  usageTotal?: number
}): Promise<ReportingEvent> => {
  const event: ReportingEvent = {
    id: `rp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    source: params.source,
    category: params.category,
    severity: params.severity,
    message: params.message,
    ...(params.note ? { note: params.note } : {}),
    ...(params.taskId ? { taskId: params.taskId } : {}),
    ...(params.elapsedMs !== undefined ? { elapsedMs: params.elapsedMs } : {}),
    ...(params.usageTotal !== undefined
      ? { usageTotal: params.usageTotal }
      : {}),
  }
  const path = reportingEventsPath(params.stateDir)
  await ensureDir(dirname(path))
  await appendJsonl(path, [event])
  return event
}

export const readReportingEvents = (
  stateDir: string,
): Promise<ReportingEvent[]> =>
  readJsonl<ReportingEvent>(reportingEventsPath(stateDir), {
    ensureFile: true,
  })
