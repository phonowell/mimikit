import {
  calcFocusDeterminismRate,
  calcRouteCorrectByQuoteRate,
} from './score-runtime-window-data.js'
import {
  type InputPacket,
  type LogRow,
  type ScoreValue,
  type TaskResultPacket,
} from './score-runtime-window-model.js'
import { evaluateContextScore } from './score-runtime-window-eval-context.js'
import { evaluateContinuityRate } from './score-runtime-window-eval-continuity.js'
import { evaluateCronScore } from './score-runtime-window-eval-cron.js'
import { evaluateDualTruthRate } from './score-runtime-window-eval-dual-truth.js'
import { evaluateEvidenceScore } from './score-runtime-window-eval-evidence.js'

export {
  evaluateContextScore,
  evaluateContinuityRate,
  evaluateCronScore,
  evaluateDualTruthRate,
  evaluateEvidenceScore,
}

export const evaluateRouteScore = (params: {
  inputs: InputPacket[]
  historyFocusById: Map<string, string>
}): ScoreValue => {
  const focusDeterminismRate = calcFocusDeterminismRate(params.inputs)
  const routeByQuoteRate = calcRouteCorrectByQuoteRate({
    inputs: params.inputs,
    historyFocusById: params.historyFocusById,
  })
  return routeByQuoteRate === 'na' ? focusDeterminismRate : routeByQuoteRate
}

export type EvaluateContextScoreResult = ReturnType<typeof evaluateContextScore>
export type EvaluateCronScoreResult = ReturnType<typeof evaluateCronScore>
export type EvaluateEvidenceScoreResult = ReturnType<typeof evaluateEvidenceScore>
export type EvaluateDualTruthRateResult = ReturnType<typeof evaluateDualTruthRate>
export type EvaluateContinuityRateResult = ReturnType<typeof evaluateContinuityRate>

export type EvalTaskResult = TaskResultPacket
export type EvalLogRow = LogRow
