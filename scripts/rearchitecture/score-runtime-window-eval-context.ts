import type { PromptSectionLimits } from '../../src/config.js'
import type { LogRow } from './score-runtime-window-model.js'

const PROMPT_SECTION_LIMIT_KEYS: Array<keyof PromptSectionLimits> = [
  'actionFeedbackMaxBytes',
  'batchResultsMaxBytes',
  'environmentMaxBytes',
  'focusListMaxBytes',
  'inputsMaxBytes',
  'memoryMaxBytes',
  'packetSummaryMaxBytes',
  'plansMaxBytes',
  'recentHistoryMaxBytes',
  'tasksMaxBytes',
  'workingFocusesMaxBytes',
]

const hasPromptSectionLimits = (
  value: LogRow['promptSectionLimits'],
): boolean =>
  Boolean(
    value &&
      typeof value === 'object' &&
      PROMPT_SECTION_LIMIT_KEYS.every(
        (key) => typeof value[key] === 'number',
      ),
  )

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
    (row) => row.event === 'manager_context_budget_resolved',
  )
  const driftRounds = budgetRows.filter((row) => {
    return row.policy !== 'fixed' || !hasPromptSectionLimits(row.promptSectionLimits)
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
