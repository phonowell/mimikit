import type { BudgetReport } from './worker-budget-report-lib.ts'

const formatMinutes = (valueMs: number | null): string =>
  valueMs === null ? '-' : `${(valueMs / 60000).toFixed(1)}m`

export const renderHumanReport = (report: BudgetReport): string =>
  [
    'Worker budget report',
    '',
    `work_dir=${report.source.workDir}`,
    `results=${report.totals.results}`,
    `budget_partial=${report.totals.budgetPartial}`,
    `resumed=${report.totals.resumed}`,
    '',
    `current_duration=${formatMinutes(report.defaults.currentMaxDurationMs)}`,
    `recommended_duration=${formatMinutes(report.recommendation.recommendedMaxDurationMs)}`,
    `recommended_rounds=${report.recommendation.recommendedMaxRounds}`,
    '',
    `p50=${formatMinutes(report.durations.p50Ms)}`,
    `p75=${formatMinutes(report.durations.p75Ms)}`,
    `p90=${formatMinutes(report.durations.p90Ms)}`,
    `p95=${formatMinutes(report.durations.p95Ms)}`,
    `max=${formatMinutes(report.durations.maxMs)}`,
    '',
    `ge10m=${report.thresholds.ge10m}`,
    `ge20m=${report.thresholds.ge20m}`,
    `ge30m=${report.thresholds.ge30m}`,
    '',
    ...report.recommendation.rationale.map((item) => `- ${item}`),
    '',
  ].join('\n')
