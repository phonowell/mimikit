import { Cron } from 'croner'

export const matchCronNow = (
  expression: string,
  at: Date = new Date(),
): boolean => new Cron(expression).match(at)
