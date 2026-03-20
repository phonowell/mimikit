import type { TraceUsageLedgerEvalReport } from './traces-usage-ledger-eval-core.js'

export const renderTraceUsageLedgerEvalReport = (
  report: TraceUsageLedgerEvalReport,
): string => {
  const failures = report.details.filter((detail) => !detail.matched)
  return [
    'Trace / usage ledger eval',
    '',
    `manifest=${report.manifestPath}`,
    `passed=${report.passed}`,
    `required=${report.requiredMatched}/${report.requiredTotal}`,
    `optional=${report.optionalMatched}/${report.optionalTotal}`,
    `samples=${report.total}`,
    '',
    ...report.scenarioCoverage.map(
      (item) => `scenario.${item.scenario}=${item.matched}/${item.total}`,
    ),
    ...(failures.length === 0
      ? ['', 'failures=0']
      : [
          '',
          ...failures.flatMap((detail) => [
            `sample=${detail.id}`,
            `scenario=${detail.scenario}`,
            ...detail.reasons.map((reason) => `reason=${reason}`),
            ...(detail.artifacts.tracePath
              ? [`trace=${detail.artifacts.tracePath}`]
              : []),
            ...(detail.artifacts.ledgerPath
              ? [`ledger=${detail.artifacts.ledgerPath}`]
              : []),
            ...(detail.artifacts.logPath
              ? [`log=${detail.artifacts.logPath}`]
              : []),
            ...(detail.referenceTests.length > 0
              ? [`tests=${detail.referenceTests.join(',')}`]
              : []),
            '',
          ]),
        ]),
  ].join('\n')
}
