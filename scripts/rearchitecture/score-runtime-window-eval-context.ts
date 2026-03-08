import { calcContextBudgetTier } from './score-runtime-window-data.js'

import type { LogRow } from './score-runtime-window-model.js'

export const evaluateContextScore = (params: {
  logs: LogRow[]
}): {
  managerRoundCount: number
  managerFeedbackRoundCount: number
  detailRecallTotal: number
  detailRecallSuccess: number
  contextWasteCount: number
  budgetRows: LogRow[]
  driftRounds: number
} => {
  const budgetRows = params.logs.filter(
    (row) => row.event === 'manager_context_budget_tier',
  )
  const driftRounds = budgetRows.filter((row) => {
    if (
      typeof row.tier !== 'string' ||
      typeof row.wakeProfile !== 'string' ||
      typeof row.inputCount !== 'number' ||
      typeof row.resultCount !== 'number' ||
      typeof row.activeFocusCount !== 'number'
    )
      return false
    const expected = calcContextBudgetTier({
      wakeProfile: row.wakeProfile,
      inputCount: row.inputCount,
      resultCount: row.resultCount,
      activeFocusCount: row.activeFocusCount,
    })
    return expected !== row.tier
  }).length

  const managerRoundCount = params.logs.filter(
    (row) => row.event === 'manager_end',
  ).length
  const managerFeedbackRoundCount = params.logs.filter(
    (row) => row.event === 'manager_action_feedback',
  ).length

  const queryContextRows = params.logs.filter(
    (row) => row.event === 'manager_query_context',
  )
  const readFileRows = params.logs.filter(
    (row) => row.event === 'manager_read_file',
  )
  const detailRecallTotal = queryContextRows.length + readFileRows.length
  const detailRecallSuccess =
    queryContextRows.filter(
      (row) =>
        typeof row.resultScopeCount === 'number' && row.resultScopeCount > 0,
    ).length +
    readFileRows.filter((row) => row.status === 'ok').length
  const contextWasteCount =
    queryContextRows.filter(
      (row) =>
        typeof row.resultScopeCount === 'number' && row.resultScopeCount === 0,
    ).length + readFileRows.filter((row) => row.status !== 'ok').length

  return {
    managerRoundCount,
    managerFeedbackRoundCount,
    detailRecallTotal,
    detailRecallSuccess,
    contextWasteCount,
    budgetRows,
    driftRounds,
  }
}
