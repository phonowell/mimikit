import type { TokenUsage } from '../types/index.js'

export const DEFAULT_WORKER_BUDGET_DURATION_MS = 20 * 60 * 1000
const BUDGET_EXCEEDED_TAG = 'mimikit.worker_budget_exceeded'

export type WorkerBudgetExceededError = Error & {
  budgetExceeded: true
  code: typeof BUDGET_EXCEEDED_TAG
  latestOutput: string
  elapsedMs: number
  round: number
  usage?: TokenUsage
  threadId?: string
}

export const buildWorkerBudgetExceededError = (params: {
  latestOutput: string
  elapsedMs: number
  round: number
  usage?: TokenUsage
  threadId?: string
}): WorkerBudgetExceededError => {
  const error = new Error(
    `[worker] task paused after partial result: reason=budget_exhausted; round=${params.round}; elapsedMs=${params.elapsedMs}`,
  ) as WorkerBudgetExceededError
  error.name = 'WorkerBudgetExceededError'
  error.code = BUDGET_EXCEEDED_TAG
  error.budgetExceeded = true
  error.latestOutput = params.latestOutput
  error.elapsedMs = params.elapsedMs
  error.round = params.round
  if (params.usage) error.usage = params.usage
  if (params.threadId) error.threadId = params.threadId
  return error
}

export const isWorkerBudgetExceededError = (
  error: unknown,
): error is WorkerBudgetExceededError =>
  error instanceof Error &&
  (error as Partial<WorkerBudgetExceededError>).budgetExceeded === true &&
  (error as Partial<WorkerBudgetExceededError>).code === BUDGET_EXCEEDED_TAG
