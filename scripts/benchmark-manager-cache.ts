import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defaultConfig } from '../src/config.js'
import { runManagerLlmCall } from '../src/manager/manager-llm-call.js'
import { buildManagerPromptPayload } from '../src/prompts/build-prompts.js'

type BenchRound = {
  round: number
  before_input: number
  before_inputCacheRead: number
  before_ratio: number
  after_input: number
  after_inputCacheRead: number
  after_ratio: number
}

type BenchSummary = {
  rounds: number
  before_total_input: number
  before_total_inputCacheRead: number
  before_ratio: number
  after_total_input: number
  after_total_inputCacheRead: number
  after_ratio: number
  improved: boolean
  target_met: boolean
}

const parseArgs = (): { rounds: number } => {
  const roundsArg = process.argv.find((arg) => arg.startsWith('--rounds='))
  const rounds = roundsArg ? Number.parseInt(roundsArg.split('=')[1] ?? '', 10) : 8
  if (!Number.isFinite(rounds) || rounds <= 0)
    throw new Error('invalid --rounds, expected positive integer')
  return { rounds }
}

const summarize = (rows: BenchRound[]): BenchSummary => {
  const beforeTotalInput = rows.reduce((sum, row) => sum + row.before_input, 0)
  const beforeTotalRead = rows.reduce(
    (sum, row) => sum + row.before_inputCacheRead,
    0,
  )
  const afterTotalInput = rows.reduce((sum, row) => sum + row.after_input, 0)
  const afterTotalRead = rows.reduce(
    (sum, row) => sum + row.after_inputCacheRead,
    0,
  )
  const beforeRatio = beforeTotalInput > 0 ? beforeTotalRead / beforeTotalInput : 0
  const afterRatio = afterTotalInput > 0 ? afterTotalRead / afterTotalInput : 0
  return {
    rounds: rows.length,
    before_total_input: beforeTotalInput,
    before_total_inputCacheRead: beforeTotalRead,
    before_ratio: beforeRatio,
    after_total_input: afterTotalInput,
    after_total_inputCacheRead: afterTotalRead,
    after_ratio: afterRatio,
    improved: afterRatio > beforeRatio,
    target_met: afterRatio >= 0.5,
  }
}

const normalizeUsage = (usage?: { input?: number; inputCacheRead?: number }) => ({
  input: usage?.input ?? 0,
  inputCacheRead: usage?.inputCacheRead ?? 0,
})

const assertUsage = (
  usage: { input?: number; inputCacheRead?: number },
  mode: 'before' | 'after',
  round: number,
): { input: number; inputCacheRead: number } => {
  if (!(usage.input > 0))
    throw new Error(
      `missing usage.input for ${mode} round ${String(round)}`,
    )
  return {
    input: usage.input,
    inputCacheRead: usage.inputCacheRead ?? 0,
  }
}

const createRoundInput = (round: number) => ({
  id: `input-bench-${round}`,
  role: 'user' as const,
  text: `Round ${round}: continue same goal and constraints.`,
  createdAt: `2026-03-08T00:00:${String(round).padStart(2, '0')}.000Z`,
  focusId: 'focus-global',
})

const buildVolatileRoundMarker = (round: number): string =>
  `<M:benchmark_round>round=${String(round)}</M:benchmark_round>`

const main = async (): Promise<void> => {
  const { rounds } = parseArgs()
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-manager-cache-bench-'))
  const historyDir = join(stateDir, 'history')
  await mkdir(historyDir, { recursive: true })
  await writeFile(join(historyDir, '2026-03-08.jsonl'), '', 'utf8')

  const config = defaultConfig({ workDir: stateDir })
  const rows: BenchRound[] = []
  let baselineThreadId: string | null | undefined
  let optimizedThreadId: string | null | undefined

  try {
    for (let round = 1; round <= rounds; round += 1) {
      const promptPayload = await buildManagerPromptPayload({
        stateDir,
        workDir: stateDir,
        inputs: [createRoundInput(round)],
        results: [],
        tasks: [],
        promptSectionLimits: config.manager.promptSections,
      })
      const roundMarker = buildVolatileRoundMarker(round)
      const beforePrompt = `${roundMarker}\n${promptPayload.prompt}`
      const optimizedSuffix = `${roundMarker}\n${promptPayload.suffix}`.trim()
      const afterPrompt = `${promptPayload.prefix}\n\n${optimizedSuffix}`.trim()

      const baseline = await runManagerLlmCall({
        prompt: beforePrompt,
        ...(baselineThreadId ? { threadId: baselineThreadId } : {}),
        workDir: stateDir,
        model: config.manager.model,
        ...(config.manager.baseUrl ? { baseUrl: config.manager.baseUrl } : {}),
        ...(config.manager.apiKey ? { apiKey: config.manager.apiKey } : {}),
        ...(config.manager.proxy ? { proxy: config.manager.proxy } : {}),
        modelReasoningEffort: config.manager.modelReasoningEffort,
      })
      baselineThreadId = baseline.threadId

      const optimized = await runManagerLlmCall({
        prompt: afterPrompt,
        promptSegments: [
          promptPayload.promptSegments[0] ?? { text: promptPayload.prefix },
          { text: optimizedSuffix },
        ],
        ...(optimizedThreadId ? { threadId: optimizedThreadId } : {}),
        workDir: stateDir,
        model: config.manager.model,
        ...(config.manager.baseUrl ? { baseUrl: config.manager.baseUrl } : {}),
        ...(config.manager.apiKey ? { apiKey: config.manager.apiKey } : {}),
        ...(config.manager.proxy ? { proxy: config.manager.proxy } : {}),
        modelReasoningEffort: config.manager.modelReasoningEffort,
      })
      optimizedThreadId = optimized.threadId

      const before = assertUsage(normalizeUsage(baseline.usage), 'before', round)
      const after = assertUsage(normalizeUsage(optimized.usage), 'after', round)

      rows.push({
        round,
        before_input: before.input,
        before_inputCacheRead: before.inputCacheRead,
        before_ratio: before.input > 0 ? before.inputCacheRead / before.input : 0,
        after_input: after.input,
        after_inputCacheRead: after.inputCacheRead,
        after_ratio: after.input > 0 ? after.inputCacheRead / after.input : 0,
      })
    }

    const summary = summarize(rows)
    const payload = {
      scenario: 'manager-cache-hit-rate-benchmark',
      generated_at: new Date().toISOString(),
      rounds: rows,
      summary,
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    process.stdout.write(`before_ratio=${summary.before_ratio.toFixed(4)}\n`)
    process.stdout.write(`after_ratio=${summary.after_ratio.toFixed(4)}\n`)
    process.stdout.write(`target_met=${summary.target_met ? 'true' : 'false'}\n`)
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
}

void main()
