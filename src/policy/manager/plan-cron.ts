import { Cron } from 'croner'

const resolveCronOptions = (
  timeZone?: string,
): { timezone: string } | undefined =>
  timeZone ? { timezone: timeZone } : undefined

export const matchesCronNow = (
  expression: string,
  timeZone?: string,
  at: Date = new Date(),
): boolean => new Cron(expression, resolveCronOptions(timeZone)).match(at)

export const hasNextCronRun = (
  expression: string,
  timeZone?: string,
): boolean =>
  new Cron(expression, resolveCronOptions(timeZone)).nextRun() !== null

export const resolveNextCronRunAtMs = (
  expression: string,
  timeZone?: string,
  now: Date = new Date(),
): number | undefined =>
  new Cron(expression, resolveCronOptions(timeZone)).nextRun(now)?.getTime()
