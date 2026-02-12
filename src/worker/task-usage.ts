import type { Task, TokenUsage } from '../types/index.js'

const asNonZeroUsage = (
  input: number,
  output: number,
): TokenUsage | undefined => {
  const total = input + output
  if (total <= 0) return undefined
  return { input, output, total }
}

export const applyTaskUsage = (
  task: Task,
  input: number,
  output: number,
): number => {
  const usage = asNonZeroUsage(input, output)
  if (!usage) return 0
  task.usage = usage
  return usage.total ?? 0
}

export const mergeUsage = (
  first?: TokenUsage,
  second?: TokenUsage,
): TokenUsage | undefined =>
  asNonZeroUsage(
    (first?.input ?? 0) + (second?.input ?? 0),
    (first?.output ?? 0) + (second?.output ?? 0),
  )
