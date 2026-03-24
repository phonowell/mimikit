import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { readJsonl } from '../../src/persistence/storage/jsonl.js'

type GoldenCase = {
  id: string
  scenario?: string
  optional?: boolean
  expected: {
    status?: 'succeeded' | 'failed' | 'canceled'
    requireEvidence?: boolean
  }
}

type JsonPacket<TPayload> = {
  payload: TPayload
}

type TaskResultPayload = {
  taskId: string
  status: 'succeeded' | 'failed' | 'canceled'
  evidence?: unknown
}

const parseArg = (name: string): string | undefined => {
  const prefix = `--${name}=`
  const entry = process.argv.find((item) => item.startsWith(prefix))
  return entry ? entry.slice(prefix.length) : undefined
}

const loadGoldenCases = async (path: string): Promise<GoldenCase[]> => {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('golden set must be an array')
  return parsed.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('invalid golden case')
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id) throw new Error('golden case id is required')
    const expectedRaw =
      row.expected && typeof row.expected === 'object'
        ? (row.expected as Record<string, unknown>)
        : {}
    const status =
      expectedRaw.status === 'succeeded' ||
      expectedRaw.status === 'failed' ||
      expectedRaw.status === 'canceled'
        ? expectedRaw.status
        : undefined
    const requireEvidence =
      typeof expectedRaw.requireEvidence === 'boolean'
        ? expectedRaw.requireEvidence
        : undefined
    return {
      id,
      ...(typeof row.scenario === 'string' && row.scenario.trim().length > 0
        ? { scenario: row.scenario.trim() }
        : {}),
      ...(row.optional === true ? { optional: true } : {}),
      expected: {
        ...(status ? { status } : {}),
        ...(requireEvidence !== undefined ? { requireEvidence } : {}),
      },
    }
  })
}

const runReplay = async (params: {
  workDir: string
  goldenSetPath: string
}): Promise<void> => {
  const cases = await loadGoldenCases(params.goldenSetPath)
  const packets = await readJsonl<JsonPacket<TaskResultPayload>>(
    join(params.workDir, 'results', 'packets.jsonl'),
    { ensureFile: true },
  )
  const byTaskId = new Map(
    packets.map((packet) => [packet.payload.taskId, packet.payload]),
  )

  const scenarioTotals = new Map<string, number>()
  const scenarioMatched = new Map<string, number>()
  const details = cases.map((item) => {
    const scenario = item.scenario ?? 'unclassified'
    scenarioTotals.set(scenario, (scenarioTotals.get(scenario) ?? 0) + 1)
    const result = byTaskId.get(item.id)
    const hasResult = Boolean(result)
    const statusMatch =
      !item.expected.status || item.expected.status === result?.status
    const evidenceMatch =
      item.expected.requireEvidence === undefined
        ? true
        : item.expected.requireEvidence === Boolean(result?.evidence)
    const matched = hasResult && statusMatch && evidenceMatch
    if (matched)
      scenarioMatched.set(scenario, (scenarioMatched.get(scenario) ?? 0) + 1)
    return {
      id: item.id,
      matched,
      scenario,
      optional: item.optional === true,
      ...(hasResult ? { actualStatus: result?.status } : { actualStatus: 'missing' }),
      ...(item.expected.status ? { expectedStatus: item.expected.status } : {}),
      ...(item.expected.requireEvidence !== undefined
        ? { expectedEvidence: item.expected.requireEvidence }
        : {}),
    }
  })

  const required = details.filter((item) => !item.optional)
  const matchedCount = required.filter((item) => item.matched).length
  const total = required.length
  const matchRate = total === 0 ? 0 : Number((matchedCount / total).toFixed(4))
  const coverage = [...scenarioTotals.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([scenario, count]) => ({
      scenario,
      total: count,
      matched: scenarioMatched.get(scenario) ?? 0,
    }))
  const optionalTotal = details.length - total
  const optionalMatched = details.filter(
    (item) => item.optional && item.matched,
  ).length
  console.log(
    JSON.stringify(
      {
        requiredTotal: total,
        requiredMatched: matchedCount,
        requiredUnmatched: total - matchedCount,
        optionalTotal,
        optionalMatched,
        optionalUnmatched: optionalTotal - optionalMatched,
        total,
        matched: matchedCount,
        unmatched: total - matchedCount,
        goldenReplayMatchRate: matchRate,
        replayDeterminismRate: matchRate,
        scenarioCoverage: coverage,
        details,
      },
      null,
      2,
    ),
  )
}

const main = async (): Promise<void> => {
  const workDir = parseArg('work-dir') ?? '.mimikit'
  const goldenSetPath =
    parseArg('golden-set') ?? 'overflows/golden-set-example.json'
  await runReplay({ workDir, goldenSetPath })
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[replay-golden-set] ${message}`)
  process.exitCode = 1
})
