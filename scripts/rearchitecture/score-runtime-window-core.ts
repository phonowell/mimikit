import { join } from 'node:path'

import { collectTaskProgressIntegrity } from './score-runtime-window-data.js'
import {
  evaluateContextScore,
  evaluateCronScore,
  evaluateEvidenceScore,
  evaluateRouteScore,
} from './score-runtime-window-eval.js'
import { evaluateGoldenRates } from './score-runtime-window-golden.js'
import { evaluateSchemaMetrics } from './score-runtime-window-schema.js'
import { buildDataOverview, buildCounts } from './score-runtime-window-summary.js'
import { buildThresholds, buildBlockers } from './score-runtime-window-threshold.js'
import { collectRoundData } from './score-runtime-window-core-round.js'
import { buildGovernance } from './score-runtime-window-core-build-governance.js'

import type { ScoreInput, ScoreOutput } from './score-runtime-window-model.js'

export const scoreRuntimeWindow = async (
  input: ScoreInput,
): Promise<ScoreOutput> => {
  const {
    history,
    goldenCases,
    windowedRawResults,
    windowedResults,
    windowedInputs,
    windowedLogRows,
  } = await collectRoundData(input)

  const total = windowedResults.length
  const succeeded = windowedResults.filter((item) => item.status === 'succeeded').length
  const failed = windowedResults.filter((item) => item.status === 'failed').length
  const canceled = windowedResults.filter((item) => item.status === 'canceled').length

  const evidenceScore = evaluateEvidenceScore({
    results: windowedResults,
    mismatchTaskIds: new Set(
      windowedLogRows
        .filter((row) => row.event === 'task_evidence_mismatch')
        .map((row) => (typeof row.taskId === 'string' ? row.taskId : ''))
        .filter((item) => item.length > 0),
    ),
  })

  const governance = buildGovernance({
    succeeded,
    failed,
    canceled,
    total,
    routeCorrectRate: evaluateRouteScore({
      inputs: windowedInputs,
      historyFocusById: new Map(
        history.map((item) => [item.id, item.focusId.trim()] as const),
      ),
    }),
    progress: await collectTaskProgressIntegrity({
      workDir: input.workDir,
      fromDay: input.windowFrom.slice(0, 10),
      toDay: input.windowTo.slice(0, 10),
    }),
    schemaScore: await evaluateSchemaMetrics({
      runtimeSnapshotPath: join(input.workDir, 'runtime-snapshot.json'),
      migrationEventCount: windowedLogRows.filter(
        (row) => row.event === 'runtime_schema_migration_applied',
      ).length,
    }),
    rawResults: windowedRawResults,
    dedupResults: windowedResults,
    evidenceScore,
    contextScore: evaluateContextScore({ logs: windowedLogRows }),
    cronScore: evaluateCronScore({ logs: windowedLogRows }),
    goldenRates: evaluateGoldenRates({
      results: windowedResults,
      goldenCases,
    }),
  })

  const thresholds = buildThresholds()
  const blockers = buildBlockers({ governance, thresholds })

  return {
    window: {
      type: input.windowType,
      from: input.windowFrom,
      to: input.windowTo,
    },
    version: input.version,
    collectedAt: new Date().toISOString(),
    dataOverview: buildDataOverview({
      total,
      succeeded,
      failed,
      canceled,
      governance,
    }),
    governance,
    thresholds,
    counts: buildCounts(governance),
    status: blockers.length === 0 ? 'stable' : 'unstable',
    blockers,
  }
}
