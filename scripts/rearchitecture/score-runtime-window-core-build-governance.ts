import {
  evaluateContinuityRate,
  evaluateDualTruthRate,
} from './score-runtime-window-eval.js'
import { ratio, type ScoreValue, type TaskResultPacket } from './score-runtime-window-model.js'

import type { LogRow } from './score-runtime-window-model.js'

type BuildGovernanceInput = {
  succeeded: number
  failed: number
  canceled: number
  total: number
  routeCorrectRate: ScoreValue
  progress: { total: number; ok: number }
  schemaScore: {
    schemaCoverageRate: ScoreValue
    schemaVersionConflictRate: ScoreValue
    migrationIntegrityRate: ScoreValue
  }
  rawResults: TaskResultPacket[]
  dedupResults: TaskResultPacket[]
  evidenceScore: {
    evidenceTaskIds: Set<string>
    evidencePassed: number
  }
  contextScore: {
    managerRoundCount: number
    managerFeedbackRoundCount: number
    detailRecallTotal: number
    detailRecallSuccess: number
    contextWasteCount: number
    budgetRows: LogRow[]
    driftRounds: number
  }
  cronScore: {
    cronTriggerRows: LogRow[]
    cronWithActionCount: number
    cronDuplicateObserved: number
    cronP95Seconds: ScoreValue
  }
  goldenRates: {
    goldenReplayMatchRate: ScoreValue
    replayDeterminismRate: ScoreValue
  }
}

export const buildGovernance = (
  params: BuildGovernanceInput,
): Record<string, ScoreValue> => ({
  task_success_rate: ratio(params.succeeded, params.total),
  task_fail_rate: ratio(params.failed, params.total),
  task_cancel_rate: ratio(params.canceled, params.total),
  intent_done_rate: ratio(params.succeeded, params.total),
  intent_deviated_rate: ratio(params.failed, params.total),
  intent_unfulfilled_rate: ratio(params.canceled, params.total),
  action_evidence_rate: ratio(params.evidenceScore.evidenceTaskIds.size, params.total),
  route_correct_rate: params.routeCorrectRate,
  progress_integrity_rate: ratio(params.progress.ok, params.progress.total),
  schema_coverage_rate: params.schemaScore.schemaCoverageRate,
  schema_version_conflict_rate: params.schemaScore.schemaVersionConflictRate,
  migration_integrity_rate: params.schemaScore.migrationIntegrityRate,
  dual_truth_rate: evaluateDualTruthRate(params.rawResults),
  focus_key_determinism_rate: params.routeCorrectRate,
  contract_completeness_rate: ratio(params.evidenceScore.evidenceTaskIds.size, params.total),
  continuity_contract_match_rate: evaluateContinuityRate(params.dedupResults),
  evidence_quality_pass_rate: ratio(
    params.evidenceScore.evidencePassed,
    params.evidenceScore.evidenceTaskIds.size,
  ),
  manager_reask_rate: ratio(
    params.contextScore.managerFeedbackRoundCount,
    params.contextScore.managerRoundCount,
  ),
  context_waste_ratio: ratio(
    params.contextScore.contextWasteCount,
    params.contextScore.detailRecallTotal,
  ),
  detail_recall_success_rate: ratio(
    params.contextScore.detailRecallSuccess,
    params.contextScore.detailRecallTotal,
  ),
  context_budget_drift: ratio(
    params.contextScore.driftRounds,
    params.contextScore.budgetRows.length,
  ),
  cron_trigger_success_rate: ratio(
    params.cronScore.cronWithActionCount,
    params.cronScore.cronTriggerRows.length,
  ),
  cron_duplicate_suppression_rate:
    params.cronScore.cronTriggerRows.length === 0
      ? 'na'
      : Math.max(
          0,
          Number(
            (
              1 -
              params.cronScore.cronDuplicateObserved /
                params.cronScore.cronTriggerRows.length
            ).toFixed(4),
          ),
        ),
  cron_false_trigger_rate:
    params.cronScore.cronTriggerRows.length === 0
      ? 'na'
      : ratio(
          Math.max(
            0,
            params.cronScore.cronTriggerRows.length -
              params.cronScore.cronWithActionCount,
          ),
          params.cronScore.cronTriggerRows.length,
        ),
  cron_trigger_latency_p95: params.cronScore.cronP95Seconds,
  golden_replay_match_rate: params.goldenRates.goldenReplayMatchRate,
  replay_determinism_rate: params.goldenRates.replayDeterminismRate,
})
