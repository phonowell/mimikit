import type { PromptSectionLimits } from '../../src/bootstrap/config.js'
import type { LogRow } from './score-runtime-window-model.js'

const PROMPT_SECTION_LIMIT_KEYS: Array<keyof PromptSectionLimits> = [
  'actionFeedbackMaxBytes',
  'batchResultsMaxBytes',
  'environmentMaxBytes',
  'focusListMaxBytes',
  'inputsMaxBytes',
  'memoryMaxBytes',
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

  return {
    managerRoundCount,
    managerFeedbackRoundCount,
    detailRecallTotal: 0,
    detailRecallSuccess: 0,
    contextWasteCount: 0,
    budgetRows,
    driftRounds,
  }
}
