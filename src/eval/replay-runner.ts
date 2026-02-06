import { join } from 'node:path'

import { buildReplayArchiveIndex } from './replay-archive.js'
import { runReplayCase } from './replay-case-runner.js'
import {
  ReplayExitCode,
  type ReplayReport,
  type ReplaySuite,
} from './replay-types.js'

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

  for (const replayCase of params.suite.cases) {
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
      elapsedMs: Math.max(0, Date.now() - startedAt),
      outputChars: caseResult.output.length,
      commandStats: caseResult.commandStats,
      assertions: caseResult.assertions,
      ...(caseResult.error ? { error: caseResult.error } : {}),
    })
  }

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
    cases: caseReports,
  }
}

export const resolveReplayExitCode = (report: ReplayReport): number => {
  const hasRuntimeError = report.cases.some((item) => item.status === 'error')
  if (hasRuntimeError) return ReplayExitCode.RuntimeError
  if (report.failed > 0) return ReplayExitCode.AssertionFailed
  return ReplayExitCode.Success
}
