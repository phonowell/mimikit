import { nowIso } from '../shared/utils.js'

import type { RuntimeState } from './runtime.js'

const currentDate = (): string => nowIso().slice(0, 10)

const normalizeBudgetDay = (runtime: RuntimeState): void => {
  const today = currentDate()
  if (runtime.tokenBudget.date === today) return
  runtime.tokenBudget = {
    date: today,
    spent: 0,
  }
}

export const canSpendTokens = (
  runtime: RuntimeState,
  estimate = 0,
): boolean => {
  normalizeBudgetDay(runtime)
  if (!runtime.config.tokenBudget.enabled) return true
  const nextSpent = runtime.tokenBudget.spent + Math.max(0, estimate)
  return nextSpent <= runtime.config.tokenBudget.dailyTotal
}

export const addTokenUsage = (runtime: RuntimeState, usage?: number): void => {
  normalizeBudgetDay(runtime)
  const delta = typeof usage === 'number' && Number.isFinite(usage) ? usage : 0
  runtime.tokenBudget.spent = Math.max(0, runtime.tokenBudget.spent + delta)
}

export const isTokenBudgetExceeded = (runtime: RuntimeState): boolean => {
  normalizeBudgetDay(runtime)
  if (!runtime.config.tokenBudget.enabled) return false
  return runtime.tokenBudget.spent >= runtime.config.tokenBudget.dailyTotal
}
