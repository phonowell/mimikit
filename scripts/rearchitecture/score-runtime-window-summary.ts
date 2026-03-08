import type { ScoreOutput, ScoreValue } from './score-runtime-window-model.js'

export const pickNumber = (value: ScoreValue): number =>
  typeof value === 'number' ? value : 0

export const buildCounts = (governance: Record<string, ScoreValue>) => ({
  naCount: Object.values(governance).filter((value) => value === 'na').length,
  notCollectedCount: Object.values(governance).filter(
    (value) => value === 'not_collected',
  ).length,
})

export const buildDataOverview = (params: {
  total: number
  succeeded: number
  failed: number
  canceled: number
  governance: Record<string, ScoreValue>
}): ScoreOutput['dataOverview'] => ({
  totalResults: params.total,
  succeededResults: params.succeeded,
  failedResults: params.failed,
  canceledResults: params.canceled,
  taskSuccessRate: pickNumber(params.governance.task_success_rate),
  taskFailRate: pickNumber(params.governance.task_fail_rate),
  taskCancelRate: pickNumber(params.governance.task_cancel_rate),
})
