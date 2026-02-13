import { Cron } from 'croner'

export const matchCronNow = (
  expression: string,
  at: Date = new Date(),
): boolean => new Cron(expression).match(at)

export const cronHasNextRun = (expression: string): boolean => {
  try {
    return new Cron(expression).nextRun() !== null
  } catch {
    return false
  }
}
