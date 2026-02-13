import { Cron } from 'croner'

export const matchCronNow = (
  expression: string,
  at: Date = new Date(),
): boolean => new Cron(expression).match(at)

export const nextCronRun = (expression: string, from?: Date): Date | null => {
  const cron = new Cron(expression)
  if (from) return cron.nextRun(from)
  return cron.nextRun()
}
