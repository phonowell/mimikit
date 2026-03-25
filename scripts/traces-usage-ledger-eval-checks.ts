import type {
  LedgerExpectation,
  LogExpectation,
} from './traces-usage-ledger-eval-model.js'

type LedgerRow = {
  kind?: string
  status?: string
  promptBytes?: number
  usage?: {
    total?: number
  }
}

type LogRow = {
  event?: string
}

const tallyBy = (values: Array<string | undefined>): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

export const pushRecordMismatches = (
  reasons: string[],
  prefix: string,
  actual: Record<string, string>,
  expected: Record<string, string> | undefined,
): void => {
  if (!expected) return
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value)
      reasons.push(
        `${prefix}.${key} expected=${value} actual=${actual[key] ?? 'missing'}`,
      )
  }
}

export const pushSectionMismatches = (
  reasons: string[],
  actual: Map<string, string>,
  expected: string[] | undefined,
): void => {
  if (!expected) return
  for (const marker of expected) {
    if (!actual.has(marker)) reasons.push(`trace.section missing=${marker}`)
  }
}

export const pushLedgerMismatches = (
  reasons: string[],
  rows: LedgerRow[],
  expected: LedgerExpectation | undefined,
): void => {
  if (!expected) return
  if (expected.totalEntries !== undefined && rows.length !== expected.totalEntries)
    reasons.push(`ledger.totalEntries expected=${expected.totalEntries} actual=${rows.length}`)
  for (const [kind, count] of Object.entries(expected.kindCounts ?? {})) {
    const actual = tallyBy(rows.map((row) => row.kind)).get(kind) ?? 0
    if (actual !== count) reasons.push(`ledger.kind.${kind} expected=${count} actual=${actual}`)
  }
  for (const [status, count] of Object.entries(expected.statusCounts ?? {})) {
    const actual = tallyBy(rows.map((row) => row.status)).get(status) ?? 0
    if (actual !== count) reasons.push(`ledger.status.${status} expected=${count} actual=${actual}`)
  }
  const promptBytesSum = rows.reduce(
    (sum, row) => sum + (typeof row.promptBytes === 'number' ? row.promptBytes : 0),
    0,
  )
  if (
    expected.minPromptBytesSum !== undefined &&
    promptBytesSum < expected.minPromptBytesSum
  ) {
    reasons.push(
      `ledger.promptBytesSum min=${expected.minPromptBytesSum} actual=${promptBytesSum}`,
    )
  }
  const totalUsage = rows.reduce(
    (sum, row) => sum + (typeof row.usage?.total === 'number' ? row.usage.total : 0),
    0,
  )
  if (expected.minTotalUsage !== undefined && totalUsage < expected.minTotalUsage)
    reasons.push(`ledger.totalUsage min=${expected.minTotalUsage} actual=${totalUsage}`)
}

export const pushLogMismatches = (
  reasons: string[],
  rows: LogRow[],
  expected: LogExpectation | undefined,
): void => {
  if (!expected) return
  const eventCounts = tallyBy(rows.map((row) => row.event))
  for (const event of expected.requireEvents ?? []) {
    if (!eventCounts.has(event)) reasons.push(`log.event missing=${event}`)
  }
  for (const [event, minimum] of Object.entries(expected.eventCountsAtLeast ?? {})) {
    const actual = eventCounts.get(event) ?? 0
    if (actual < minimum) reasons.push(`log.event.${event} min=${minimum} actual=${actual}`)
  }
}
