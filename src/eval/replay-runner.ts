import { join } from 'node:path'

import { buildReplayArchiveIndex } from './replay-archive.js'
import { runReplayCase } from './replay-case-runner.js'
import {
  type ReplayCase,
  type ReplayCaseReport,
  ReplayExitCode,
  type ReplayReport,
  type ReplaySuite,
} from './replay-types.js'

const withReplaySuffix = (template: string, index: number): string =>
  template.replaceAll('{i}', String(index + 1))

const expandReplayCase = (replayCase: ReplayCase): ReplayCase[] => {
  const { repeat } = replayCase
  if (!repeat) return [replayCase]
  const { count } = repeat
  const idFormat = repeat.idFormat ?? `${replayCase.id}#{i}`
  const expanded: ReplayCase[] = []
  for (let index = 0; index < count; index += 1) {
    expanded.push({
      ...replayCase,
      id: withReplaySuffix(idFormat, index),
    })
  }
  return expanded
}

const expandReplayCases = (suite: ReplaySuite): ReplayCase[] =>
  suite.cases.flatMap((replayCase) => expandReplayCase(replayCase))

const aggregateReplayCaseReports = (
  caseReports: ReplayCaseReport[],
): {
  llmCalls: number
  liveCases: number
  archiveCases: number
  llmElapsedMs: number
  usage: { input: number; output: number; total: number }
} => {
  let llmCalls = 0
  let liveCases = 0
  let archiveCases = 0
  let llmElapsedMs = 0
  let usageInput = 0
  let usageOutput = 0
  let usageTotal = 0
  for (const report of caseReports) {
    if (report.source === 'live' && report.status !== 'error') {
      llmCalls += 1
      liveCases += 1
    } else if (report.source === 'archive') archiveCases += 1
    llmElapsedMs += report.llmElapsedMs
    usageInput += report.usage.input ?? 0
    usageOutput += report.usage.output ?? 0
    usageTotal += report.usage.total ?? 0
  }
  return {
    llmCalls,
    liveCases,
    archiveCases,
    llmElapsedMs,
    usage: { input: usageInput, output: usageOutput, total: usageTotal },
  }
}

export const runReplaySuite = async (params: {
  suite: ReplaySuite
  stateDir: string
  workDir: string
  timeoutMs: number
  model?: string
  seed?: number
  temperature?: number
  offline?: boolean
  preferArchive?: boolean
  archiveDir?: string
  maxFail: number
}): Promise<ReplayReport> => {
  const caseReports: ReplayReport['cases'] = []
  let failedCount = 0
  let stoppedEarly = false
  const useArchive = params.offline === true || params.preferArchive === true
  const archiveDir =
    params.archiveDir && params.archiveDir.length > 0
      ? params.archiveDir
      : join(params.stateDir, 'llm')
  const archiveIndex = useArchive
    ? await buildReplayArchiveIndex(archiveDir)
    : null
  const replayCases = expandReplayCases(params.suite)

  for (const replayCase of replayCases) {
    if (failedCount >= params.maxFail) {
      stoppedEarly = true
      break
    }

    const startedAt = Date.now()
    const caseResult = await runReplayCase({
      replayCase,
      stateDir: params.stateDir,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      ...(params.model ? { model: params.model } : {}),
      ...(params.seed !== undefined ? { seed: params.seed } : {}),
      ...(params.temperature !== undefined
        ? { temperature: params.temperature }
        : {}),
      ...(params.offline !== undefined ? { offline: params.offline } : {}),
      archiveDir,
      archiveIndex,
    })
    const { status } = caseResult

    if (status !== 'passed') failedCount += 1
    caseReports.push({
      id: replayCase.id,
      ...(replayCase.description
        ? { description: replayCase.description }
        : {}),
      status,
      source: caseResult.source,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      llmElapsedMs: caseResult.llmElapsedMs,
      usage: caseResult.usage,
      outputChars: caseResult.output.length,
      commandStats: caseResult.commandStats,
      assertions: caseResult.assertions,
      ...(caseResult.error ? { error: caseResult.error } : {}),
    })
  }

  const metrics = aggregateReplayCaseReports(caseReports)
  const total = caseReports.length
  const passed = caseReports.filter((item) => item.status === 'passed').length
  const failed = total - passed

  return {
    suite: params.suite.suite,
    version: params.suite.version,
    runAt: new Date().toISOString(),
    ...(params.model ? { model: params.model } : {}),
    total,
    passed,
    failed,
    passRate: total === 0 ? 0 : Number((passed / total).toFixed(4)),
    stoppedEarly,
    maxFail: params.maxFail,
    metrics,
    cases: caseReports,
  }
}

export const resolveReplayExitCode = (report: ReplayReport): number => {
  const hasRuntimeError = report.cases.some((item) => item.status === 'error')
  if (hasRuntimeError) return ReplayExitCode.RuntimeError
  if (report.failed > 0) return ReplayExitCode.AssertionFailed
  return ReplayExitCode.Success
}
