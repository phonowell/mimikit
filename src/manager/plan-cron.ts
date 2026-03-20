import { Cron } from 'croner'

export const matchesCronNow = (
  expression: string,
  timeZone?: string,
  at: Date = new Date(),
): boolean => new Cron(expression, timeZone).match(at)

export const hasNextCronRun = (
  expression: string,
  timeZone?: string,
): boolean => new Cron(expression, timeZone).nextRun() !== null

export const resolveNextCronRunAtMs = (
  expression: string,
  timeZone?: string,
  now: Date = new Date(),
): number | undefined => new Cron(expression, timeZone).nextRun(now)?.getTime()
