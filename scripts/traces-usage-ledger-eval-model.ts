import { readFile } from 'node:fs/promises'

export type TraceExpectation = {
  header?: Record<string, string>
  sections?: string[]
}

export type LedgerExpectation = {
  totalEntries?: number
  kindCounts?: Record<string, number>
  statusCounts?: Record<string, number>
  minPromptBytesSum?: number
  minTotalUsage?: number
  includedSections?: string[]
  prunedSections?: string[]
}

export type LogExpectation = {
  requireEvents?: string[]
  eventCountsAtLeast?: Record<string, number>
}

export type TraceUsageLedgerEvalSample = {
  id: string
  scenario: string
  description?: string
  optional?: boolean
  tracePath?: string
  ledgerPath?: string
  logPath?: string
  referenceTests?: string[]
  expected: {
    trace?: TraceExpectation
    ledger?: LedgerExpectation
    log?: LogExpectation
  }
}

export type TraceUsageLedgerEvalManifest = {
  version: string
  samples: TraceUsageLedgerEvalSample[]
}

const expectRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('expected object')
  return value as Record<string, unknown>
}

const expectString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

const asStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (value === undefined) return undefined
  const record = expectRecord(value)
  const next: Record<string, string> = {}
  for (const [key, item] of Object.entries(record)) {
    next[key] = expectString(item, key)
  }
  return next
}

const asNumberRecord = (value: unknown): Record<string, number> | undefined => {
  if (value === undefined) return undefined
  const record = expectRecord(value)
  const next: Record<string, number> = {}
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'number' || !Number.isFinite(item))
      throw new Error(`${key} must be a finite number`)
    next[key] = item
  }
  return next
}

const asStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('expected string array')
  return value.map((item, index) => expectString(item, `item_${index}`))
}

const asTraceExpectation = (value: unknown): TraceExpectation | undefined => {
  if (value === undefined) return undefined
  const record = expectRecord(value)
  return {
    ...(record.header ? { header: asStringRecord(record.header) } : {}),
    ...(record.sections ? { sections: asStringArray(record.sections) } : {}),
  }
}

const asLedgerExpectation = (value: unknown): LedgerExpectation | undefined => {
  if (value === undefined) return undefined
  const record = expectRecord(value)
  const totalEntries = record.totalEntries
  return {
    ...(typeof totalEntries === 'number' ? { totalEntries } : {}),
    ...(record.kindCounts ? { kindCounts: asNumberRecord(record.kindCounts) } : {}),
    ...(record.statusCounts
      ? { statusCounts: asNumberRecord(record.statusCounts) }
      : {}),
    ...(typeof record.minPromptBytesSum === 'number'
      ? { minPromptBytesSum: record.minPromptBytesSum }
      : {}),
    ...(typeof record.minTotalUsage === 'number'
      ? { minTotalUsage: record.minTotalUsage }
      : {}),
    ...(record.includedSections
      ? { includedSections: asStringArray(record.includedSections) }
      : {}),
    ...(record.prunedSections
      ? { prunedSections: asStringArray(record.prunedSections) }
      : {}),
  }
}

const asLogExpectation = (value: unknown): LogExpectation | undefined => {
  if (value === undefined) return undefined
  const record = expectRecord(value)
  return {
    ...(record.requireEvents
      ? { requireEvents: asStringArray(record.requireEvents) }
      : {}),
    ...(record.eventCountsAtLeast
      ? { eventCountsAtLeast: asNumberRecord(record.eventCountsAtLeast) }
      : {}),
  }
}

export const loadTraceUsageLedgerEvalManifest = async (
  path: string,
): Promise<TraceUsageLedgerEvalManifest> => {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const record = expectRecord(parsed)
  if (!Array.isArray(record.samples)) throw new Error('samples must be an array')
  return {
    version: expectString(record.version, 'version'),
    samples: record.samples.map((item, index) => {
      const sample = expectRecord(item)
      const expected = expectRecord(sample.expected)
      return {
        id: expectString(sample.id, `samples[${index}].id`),
        scenario: expectString(sample.scenario, `samples[${index}].scenario`),
        ...(typeof sample.description === 'string' && sample.description.trim().length > 0
          ? { description: sample.description.trim() }
          : {}),
        ...(sample.optional === true ? { optional: true } : {}),
        ...(typeof sample.tracePath === 'string' && sample.tracePath.trim().length > 0
          ? { tracePath: sample.tracePath.trim() }
          : {}),
        ...(typeof sample.ledgerPath === 'string' && sample.ledgerPath.trim().length > 0
          ? { ledgerPath: sample.ledgerPath.trim() }
          : {}),
        ...(typeof sample.logPath === 'string' && sample.logPath.trim().length > 0
          ? { logPath: sample.logPath.trim() }
          : {}),
        ...(Array.isArray(sample.referenceTests)
          ? {
              referenceTests: sample.referenceTests.map((entry, refIndex) =>
                expectString(entry, `samples[${index}].referenceTests[${refIndex}]`),
              ),
            }
          : {}),
        expected: {
          ...(expected.trace ? { trace: asTraceExpectation(expected.trace) } : {}),
          ...(expected.ledger ? { ledger: asLedgerExpectation(expected.ledger) } : {}),
          ...(expected.log ? { log: asLogExpectation(expected.log) } : {}),
        },
      }
    }),
  }
}
