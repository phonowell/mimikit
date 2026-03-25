import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { parseArchiveDocument } from '../src/persistence/storage/archive-format.js'
import { readJsonl } from '../src/persistence/storage/jsonl.js'

import {
  pushLedgerMismatches,
  pushLogMismatches,
  pushRecordMismatches,
  pushSectionMismatches,
} from './traces-usage-ledger-eval-checks.js'
import { loadTraceUsageLedgerEvalManifest } from './traces-usage-ledger-eval-model.js'

import type { TraceUsageLedgerEvalSample } from './traces-usage-ledger-eval-model.js'

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

export type TraceUsageLedgerEvalDetail = {
  id: string
  scenario: string
  matched: boolean
  optional: boolean
  reasons: string[]
  artifacts: {
    tracePath?: string
    ledgerPath?: string
    logPath?: string
  }
  referenceTests: string[]
}

export type TraceUsageLedgerEvalReport = {
  manifestPath: string
  total: number
  requiredTotal: number
  requiredMatched: number
  optionalTotal: number
  optionalMatched: number
  passed: boolean
  scenarioCoverage: Array<{ scenario: string; total: number; matched: number }>
  details: TraceUsageLedgerEvalDetail[]
}

const evaluateSample = async (
  baseDir: string,
  sample: TraceUsageLedgerEvalSample,
): Promise<TraceUsageLedgerEvalDetail> => {
  const tracePath = sample.tracePath ? resolve(baseDir, sample.tracePath) : undefined
  const ledgerPath = sample.ledgerPath ? resolve(baseDir, sample.ledgerPath) : undefined
  const logPath = sample.logPath ? resolve(baseDir, sample.logPath) : undefined
  const reasons: string[] = []

  if (tracePath) {
    const trace = parseArchiveDocument(await readFile(tracePath, 'utf8'))
    pushRecordMismatches(
      reasons,
      'trace.header',
      trace.header,
      sample.expected.trace?.header,
    )
    pushSectionMismatches(reasons, trace.sections, sample.expected.trace?.sections)
  }
  if (ledgerPath) {
    const ledger = await readJsonl<LedgerRow>(ledgerPath, { ensureFile: true })
    pushLedgerMismatches(reasons, ledger, sample.expected.ledger)
  }
  if (logPath) {
    const logs = await readJsonl<LogRow>(logPath, { ensureFile: true })
    pushLogMismatches(reasons, logs, sample.expected.log)
  }

  return {
    id: sample.id,
    scenario: sample.scenario,
    matched: reasons.length === 0,
    optional: sample.optional === true,
    reasons,
    artifacts: {
      ...(tracePath ? { tracePath } : {}),
      ...(ledgerPath ? { ledgerPath } : {}),
      ...(logPath ? { logPath } : {}),
    },
    referenceTests: sample.referenceTests ?? [],
  }
}

export const runTraceUsageLedgerEval = async (params: {
  manifestPath: string
  scenario?: string
}): Promise<TraceUsageLedgerEvalReport> => {
  const manifestPath = resolve(params.manifestPath)
  const manifest = await loadTraceUsageLedgerEvalManifest(manifestPath)
  const baseDir = dirname(manifestPath)
  const samples = params.scenario
    ? manifest.samples.filter((sample) => sample.scenario === params.scenario)
    : manifest.samples
  const details = await Promise.all(samples.map((sample) => evaluateSample(baseDir, sample)))
  const required = details.filter((detail) => !detail.optional)
  const optional = details.filter((detail) => detail.optional)
  const scenarioCoverage = [...new Set(details.map((detail) => detail.scenario))]
    .sort((left, right) => left.localeCompare(right))
    .map((scenario) => ({
      scenario,
      total: details.filter((detail) => detail.scenario === scenario).length,
      matched: details.filter((detail) => detail.scenario === scenario && detail.matched)
        .length,
    }))

  return {
    manifestPath,
    total: details.length,
    requiredTotal: required.length,
    requiredMatched: required.filter((detail) => detail.matched).length,
    optionalTotal: optional.length,
    optionalMatched: optional.filter((detail) => detail.matched).length,
    passed: required.every((detail) => detail.matched),
    scenarioCoverage,
    details,
  }
}
