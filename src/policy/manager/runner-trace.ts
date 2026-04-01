import {
  attachLogDiagnostics,
  readLogDiagnostics,
} from '../../persistence/log/diagnostics.js'
import {
  appendTraceArchiveResult,
  toTraceRef,
  type TraceArchiveResult,
} from '../../persistence/storage/traces-archive.js'

type ManagerErrorDiagnostics = {
  threadId?: string
  providerCallId?: string
  attempt?: number
}

type ArchiveManagerTraceParams = {
  stateDir: string
  prompt: string
  model?: string
  batchId?: string
  roundId?: string
  threadId?: string | null
  result: TraceArchiveResult
}

export const archiveManagerTrace = (params: ArchiveManagerTraceParams) =>
  appendTraceArchiveResult(
    params.stateDir,
    {
      role: 'manager',
      ...(params.model ? { model: params.model } : {}),
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.roundId ? { roundId: params.roundId } : {}),
      ...(params.threadId ? { threadId: params.threadId } : {}),
      ...(params.result.providerCallId
        ? { providerCallId: params.result.providerCallId }
        : {}),
      ...(params.result.attempt
        ? { attemptNumber: params.result.attempt }
        : {}),
      attempt:
        params.result.attempt && params.result.attempt > 1
          ? 'fallback'
          : 'primary',
    },
    params.prompt,
    params.result,
  )

export const toManagerTraceRef = (
  stateDir: string,
  tracePath: string | undefined,
): string | undefined =>
  tracePath ? toTraceRef(stateDir, tracePath) : undefined

export const readManagerErrorDiagnostics = (
  error: unknown,
): ManagerErrorDiagnostics => {
  const diagnostics = readLogDiagnostics(error)
  return {
    ...(diagnostics.threadId ? { threadId: diagnostics.threadId } : {}),
    ...(diagnostics.providerCallId
      ? { providerCallId: diagnostics.providerCallId }
      : {}),
    ...(diagnostics.attempt ? { attempt: diagnostics.attempt } : {}),
  }
}

export const attachManagerErrorDiagnostics = (params: {
  error: unknown
  stateDir: string
  tracePath?: string
  batchId?: string
  roundId?: string
}): Error => {
  const err =
    params.error instanceof Error
      ? params.error
      : new Error(String(params.error))
  const diagnostics = readLogDiagnostics(params.error)
  return attachLogDiagnostics(err, {
    ...(diagnostics.batchId || params.batchId
      ? { batchId: (diagnostics.batchId ?? params.batchId) as string }
      : {}),
    ...(diagnostics.roundId || params.roundId
      ? { roundId: (diagnostics.roundId ?? params.roundId) as string }
      : {}),
    ...(diagnostics.providerCallId
      ? { providerCallId: diagnostics.providerCallId }
      : {}),
    ...(diagnostics.attempt ? { attempt: diagnostics.attempt } : {}),
    ...(diagnostics.threadId ? { threadId: diagnostics.threadId } : {}),
    ...(params.tracePath
      ? { traceRef: toTraceRef(params.stateDir, params.tracePath) as string }
      : {}),
  })
}
