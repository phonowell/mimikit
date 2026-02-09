import { mkdir, writeFile } from 'node:fs/promises'

import { readReportingEvents } from './events.js'
import { dailyReportDirPath, dailyReportPath } from './storage.js'

import type {
  ReportingCategory,
  ReportingEvent,
  ReportingSeverity,
} from './types.js'

const pad2 = (value: number): string => String(value).padStart(2, '0')

const toLocalDay = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

const parseDay = (day: string): Date | null => {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  const value = new Date(year, month - 1, date)
  if (
    value.getFullYear() !== year ||
    value.getMonth() + 1 !== month ||
    value.getDate() !== date
  )
    return null

  return value
}

const addDays = (day: string, delta: number): string => {
  const parsed = parseDay(day)
  if (!parsed) return day
  parsed.setDate(parsed.getDate() + delta)
  return toLocalDay(parsed)
}

const formatTime = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

const countBySeverity = (
  events: ReportingEvent[],
): Record<ReportingSeverity, number> => ({
  high: events.filter((event) => event.severity === 'high').length,
  medium: events.filter((event) => event.severity === 'medium').length,
  low: events.filter((event) => event.severity === 'low').length,
})

const countByCategory = (
  events: ReportingEvent[],
): Record<ReportingCategory, number> => ({
  quality: events.filter((event) => event.category === 'quality').length,
  latency: events.filter((event) => event.category === 'latency').length,
  cost: events.filter((event) => event.category === 'cost').length,
  failure: events.filter((event) => event.category === 'failure').length,
  ux: events.filter((event) => event.category === 'ux').length,
  other: events.filter((event) => event.category === 'other').length,
})

const buildEventLine = (event: ReportingEvent): string => {
  const details: string[] = []
  if (event.taskId) details.push(`task=${event.taskId}`)
  if (event.elapsedMs !== undefined)
    details.push(`elapsedMs=${event.elapsedMs}`)
  if (event.usageTotal !== undefined)
    details.push(`usageTotal=${event.usageTotal}`)
  const detailText = details.length > 0 ? ` (${details.join(', ')})` : ''
  return `- [${formatTime(event.createdAt)}] [${event.severity}] [${event.category}] ${event.message}${detailText}`
}

const buildDailyReport = (params: {
  day: string
  generatedAt: string
  events: ReportingEvent[]
}): string => {
  const severity = countBySeverity(params.events)
  const category = countByCategory(params.events)
  const lines = [
    `# Mimikit 每日报告 ${params.day}`,
    '',
    `生成时间：${params.generatedAt}`,
    `事件总数：${params.events.length}`,
    `严重度：high=${severity.high} / medium=${severity.medium} / low=${severity.low}`,
    '',
    '## 分类统计',
    `- failure: ${category.failure}`,
    `- latency: ${category.latency}`,
    `- cost: ${category.cost}`,
    `- quality: ${category.quality}`,
    `- ux: ${category.ux}`,
    `- other: ${category.other}`,
    '',
    '## 关键事件',
  ]

  if (params.events.length === 0) {
    lines.push('- 当日无事件')
    return `${lines.join('\n')}\n`
  }

  for (const event of params.events.slice(0, 50))
    lines.push(buildEventLine(event))
  return `${lines.join('\n')}\n`
}

const eventsOfDay = (events: ReportingEvent[], day: string): ReportingEvent[] =>
  events
    .filter((event) => toLocalDay(new Date(event.createdAt)) === day)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

const writeDailyReport = async (params: {
  stateDir: string
  day: string
  generatedAt: string
  events: ReportingEvent[]
}): Promise<void> => {
  const dir = dailyReportDirPath(params.stateDir)
  await mkdir(dir, { recursive: true })
  const path = dailyReportPath(params.stateDir, params.day)
  const body = buildDailyReport({
    day: params.day,
    generatedAt: params.generatedAt,
    events: params.events,
  })
  await writeFile(path, body, 'utf8')
}

const withOptionalDate = (
  date: string | undefined,
  generatedDates: string[],
): { lastDailyReportDate?: string; generatedDates: string[] } =>
  date ? { lastDailyReportDate: date, generatedDates } : { generatedDates }

export const generateMissingDailyReports = async (params: {
  stateDir: string
  lastDailyReportDate?: string
  now?: Date
}): Promise<{ lastDailyReportDate?: string; generatedDates: string[] }> => {
  const now = params.now ?? new Date()
  const today = toLocalDay(now)
  const latestClosedDay = addDays(today, -1)
  if (
    params.lastDailyReportDate &&
    params.lastDailyReportDate >= latestClosedDay
  )
    return withOptionalDate(params.lastDailyReportDate, [])

  const fromDay = params.lastDailyReportDate
    ? addDays(params.lastDailyReportDate, 1)
    : latestClosedDay
  if (fromDay > latestClosedDay)
    return withOptionalDate(params.lastDailyReportDate, [])

  const events = await readReportingEvents(params.stateDir)
  const generatedAt = new Date().toISOString()
  const generatedDates: string[] = []
  let cursor = fromDay
  while (cursor <= latestClosedDay) {
    await writeDailyReport({
      stateDir: params.stateDir,
      day: cursor,
      generatedAt,
      events: eventsOfDay(events, cursor),
    })
    generatedDates.push(cursor)
    cursor = addDays(cursor, 1)
  }

  return withOptionalDate(
    generatedDates.at(-1) ?? params.lastDailyReportDate,
    generatedDates,
  )
}
