import { relative } from 'node:path'

import { newId } from '../../foundation/shared/utils.js'

export type LogDiagnostics = {
  batchId?: string | undefined
  roundId?: string | undefined
  providerCallId?: string | undefined
  attempt?: number | undefined
  traceRef?: string | undefined
  threadId?: string | undefined
}

const LOG_DIAGNOSTICS_SYMBOL = Symbol.for('mimikit.log_diagnostics')

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const normalizeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export const createBatchId = (): string => `batch-${newId()}`

export const createRoundId = (): string => `round-${newId()}`

export const createProviderCallId = (): string => `call-${newId()}`

export const toTraceRef = (
  stateDir: string,
  tracePath: string,
): string | undefined => {
  const trimmed = tracePath.trim()
  if (!trimmed) return undefined
  const stateRelative = relative(stateDir, trimmed).replace(/\\/g, '/')
  if (!stateRelative || stateRelative.startsWith('..')) return undefined
  return `.mimikit/${stateRelative}`
}

export const attachLogDiagnostics = <TError extends Error>(
  error: TError,
  diagnostics: LogDiagnostics,
): TError => {
  const normalized = {
    ...(normalizeString(diagnostics.batchId)
      ? { batchId: normalizeString(diagnostics.batchId) }
      : {}),
    ...(normalizeString(diagnostics.roundId)
      ? { roundId: normalizeString(diagnostics.roundId) }
      : {}),
    ...(normalizeString(diagnostics.providerCallId)
      ? { providerCallId: normalizeString(diagnostics.providerCallId) }
      : {}),
    ...(normalizeNumber(diagnostics.attempt) !== undefined
      ? { attempt: normalizeNumber(diagnostics.attempt) }
      : {}),
    ...(normalizeString(diagnostics.traceRef)
      ? { traceRef: normalizeString(diagnostics.traceRef) }
      : {}),
    ...(normalizeString(diagnostics.threadId)
      ? { threadId: normalizeString(diagnostics.threadId) }
      : {}),
  } satisfies LogDiagnostics
  if (Object.keys(normalized).length === 0) return error
  Object.defineProperty(error, LOG_DIAGNOSTICS_SYMBOL, {
    value: normalized,
    configurable: true,
    enumerable: false,
    writable: false,
  })
  for (const [key, value] of Object.entries(normalized))
    Reflect.set(error as object, key, value)
  return error
}

export const readLogDiagnostics = (error: unknown): LogDiagnostics => {
  if (!error || typeof error !== 'object') return {}
  const record = error as Record<PropertyKey, unknown>
  const symbolValue = record[LOG_DIAGNOSTICS_SYMBOL]
  const symbolRecord =
    symbolValue && typeof symbolValue === 'object'
      ? (symbolValue as Record<string, unknown>)
      : {}
  return {
    ...(normalizeString(symbolRecord.batchId ?? record.batchId)
      ? { batchId: normalizeString(symbolRecord.batchId ?? record.batchId) }
      : {}),
    ...(normalizeString(symbolRecord.roundId ?? record.roundId)
      ? { roundId: normalizeString(symbolRecord.roundId ?? record.roundId) }
      : {}),
    ...(normalizeString(symbolRecord.providerCallId ?? record.providerCallId)
      ? {
          providerCallId: normalizeString(
            symbolRecord.providerCallId ?? record.providerCallId,
          ),
        }
      : {}),
    ...(normalizeNumber(symbolRecord.attempt ?? record.attempt) !== undefined
      ? { attempt: normalizeNumber(symbolRecord.attempt ?? record.attempt) }
      : {}),
    ...(normalizeString(symbolRecord.traceRef ?? record.traceRef)
      ? { traceRef: normalizeString(symbolRecord.traceRef ?? record.traceRef) }
      : {}),
    ...(normalizeString(symbolRecord.threadId ?? record.threadId)
      ? { threadId: normalizeString(symbolRecord.threadId ?? record.threadId) }
      : {}),
  } satisfies LogDiagnostics
}
