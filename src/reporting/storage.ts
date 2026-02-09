import { join, resolve } from 'node:path'

export const reportingDirPath = (stateDir: string): string =>
  resolve(join(stateDir, 'reporting'))

export const reportingEventsPath = (stateDir: string): string =>
  resolve(join(reportingDirPath(stateDir), 'events.jsonl'))

export const dailyReportDirPath = (stateDir: string): string =>
  resolve(join(stateDir, 'reports', 'daily'))

export const dailyReportPath = (stateDir: string, day: string): string =>
  resolve(join(dailyReportDirPath(stateDir), `${day}.md`))
