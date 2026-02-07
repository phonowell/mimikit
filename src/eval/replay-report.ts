import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { ReplayCaseReport, ReplayReport } from './replay-types.js'

const ensureParentDir = async (path: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
}

const formatCommandStats = (stats: Record<string, number>): string => {
  const entries = Object.entries(stats)
  if (entries.length === 0) return 'none'
  return entries.map(([action, count]) => `${action}:${count}`).join(', ')
}

const formatFailedAssertions = (caseReport: ReplayCaseReport): string[] =>
  caseReport.assertions
    .filter((assertion) => !assertion.passed)
    .map((assertion) => `${assertion.kind}:${assertion.target}`)

const renderFailedTable = (failedCases: ReplayCaseReport[]): string => {
  if (failedCases.length === 0) return 'No failed cases.\n'

  const rows = failedCases.map((caseReport) => {
    const failed = formatFailedAssertions(caseReport)
    const reason = caseReport.error ?? (failed.join('; ') || 'unknown')
    return `| ${caseReport.id} | ${caseReport.status} | ${reason.replace(/\|/g, '\\|')} |`
  })

  return [
    '| case | status | reason |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

const renderFailureDetails = (failedCases: ReplayCaseReport[]): string => {
  if (failedCases.length === 0) return ''

  const sections = failedCases.map((caseReport) => {
    const failedAssertions = formatFailedAssertions(caseReport)
    return [
      `### ${caseReport.id}`,
      `- status: ${caseReport.status}`,
      `- source: ${caseReport.source}`,
      `- elapsedMs: ${caseReport.elapsedMs}`,
      `- llmElapsedMs: ${caseReport.llmElapsedMs}`,
      `- usage: input=${caseReport.usage.input ?? 0}, output=${caseReport.usage.output ?? 0}, total=${caseReport.usage.total ?? 0}`,
      `- commandStats: ${formatCommandStats(caseReport.commandStats)}`,
      `- failedAssertions: ${failedAssertions.length > 0 ? failedAssertions.join('; ') : 'none'}`,
      ...(caseReport.error ? [`- error: ${caseReport.error}`] : []),
      '',
    ].join('\n')
  })

  return ['## Failure Details', '', ...sections].join('\n')
}

export const buildReplayMarkdown = (report: ReplayReport): string => {
  const failedCases = report.cases.filter(
    (caseReport) => caseReport.status !== 'passed',
  )
  const summary = [
    `# Replay Eval Report: ${report.suite}`,
    '',
    '## Summary',
    `- runAt: ${report.runAt}`,
    `- version: ${report.version}`,
    `- model: ${report.model ?? 'default'}`,
    `- total: ${report.total}`,
    `- passed: ${report.passed}`,
    `- failed: ${report.failed}`,
    `- passRate: ${report.passRate}`,
    `- stoppedEarly: ${report.stoppedEarly}`,
    `- maxFail: ${report.maxFail}`,
    '- metrics:',
    `  - llmCalls: ${report.metrics.llmCalls}`,
    `  - liveCases: ${report.metrics.liveCases}`,
    `  - archiveCases: ${report.metrics.archiveCases}`,
    `  - llmElapsedMs: ${report.metrics.llmElapsedMs}`,
    `  - usage.input: ${report.metrics.usage.input}`,
    `  - usage.output: ${report.metrics.usage.output}`,
    `  - usage.total: ${report.metrics.usage.total}`,
    '',
    '## Failed Cases',
    renderFailedTable(failedCases),
  ]

  const details = renderFailureDetails(failedCases)
  return `${summary.join('\n')}${details ? `\n${details}` : ''}`
}

export const writeReplayReportJson = async (
  path: string,
  report: ReplayReport,
): Promise<void> => {
  await ensureParentDir(path)
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

export const writeReplayReportMarkdown = async (
  path: string,
  report: ReplayReport,
): Promise<void> => {
  await ensureParentDir(path)
  await writeFile(path, `${buildReplayMarkdown(report)}\n`, 'utf8')
}
