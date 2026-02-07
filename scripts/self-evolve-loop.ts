import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { buildPromotionPolicy } from '../src/evolve/loop-stop.js'
import { runSelfEvolveLoop } from '../src/evolve/loop.js'
import { loadCodexSettings } from '../src/llm/openai.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_ROUNDS = 5
const DEFAULT_PROMPT_PATH = 'prompts/agents/manager/system.md'

const parsePositiveInteger = (raw: string | undefined, flag: string): number => {
  if (!raw) throw new Error(`${flag} requires a value`)
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${flag} must be a positive integer`)
  return parsed
}

const parseFiniteNumber = (raw: string | undefined, flag: string): number => {
  if (!raw) throw new Error(`${flag} requires a value`)
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a number`)
  return parsed
}

const parseNonNegativeInteger = (
  raw: string | undefined,
  flag: string,
): number => {
  if (!raw) throw new Error(`${flag} requires a value`)
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${flag} must be a non-negative integer`)
  return parsed
}

const main = async () => {
  const rawArgs = process.argv.slice(2)
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      suite: { type: 'string' },
      'out-dir': { type: 'string', default: '.mimikit/generated/evolve-loop' },
      'state-dir': {
        type: 'string',
        default: '.mimikit/generated/evolve-loop/state',
      },
      'work-dir': { type: 'string', default: '.' },
      'prompt-path': { type: 'string', default: DEFAULT_PROMPT_PATH },
      'timeout-ms': { type: 'string' },
      'max-rounds': { type: 'string' },
      'min-pass-rate-delta': { type: 'string' },
      'min-token-delta': { type: 'string' },
      'min-latency-delta-ms': { type: 'string' },
      model: { type: 'string' },
      'optimizer-model': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    console.log(
      'Usage: pnpm self:evolve:loop -- --suite <path> [--max-rounds <n>] [--out-dir <path>] [--state-dir <path>] [--work-dir <path>] [--prompt-path <path>] [--timeout-ms <n>] [--model <name>] [--optimizer-model <name>]',
    )
    process.exit(0)
  }

  if (!values.suite) throw new Error('--suite is required')

  await loadCodexSettings()

  const result = await runSelfEvolveLoop({
    suitePath: resolve(values.suite),
    outDir: resolve(values['out-dir']),
    stateDir: resolve(values['state-dir']),
    workDir: resolve(values['work-dir']),
    promptPath: resolve(values['prompt-path']),
    timeoutMs: values['timeout-ms']
      ? parsePositiveInteger(values['timeout-ms'], '--timeout-ms')
      : DEFAULT_TIMEOUT_MS,
    maxRounds: values['max-rounds']
      ? parsePositiveInteger(values['max-rounds'], '--max-rounds')
      : DEFAULT_MAX_ROUNDS,
    promotionPolicy: buildPromotionPolicy({
      ...(values['min-pass-rate-delta'] !== undefined
        ? {
            minPassRateDelta: parseFiniteNumber(
              values['min-pass-rate-delta'],
              '--min-pass-rate-delta',
            ),
          }
        : {}),
      ...(values['min-token-delta'] !== undefined
        ? {
            minTokenDelta: parseNonNegativeInteger(
              values['min-token-delta'],
              '--min-token-delta',
            ),
          }
        : {}),
      ...(values['min-latency-delta-ms'] !== undefined
        ? {
            minLatencyDeltaMs: parseNonNegativeInteger(
              values['min-latency-delta-ms'],
              '--min-latency-delta-ms',
            ),
          }
        : {}),
    }),
    ...(values.model ? { model: values.model } : {}),
    ...(values['optimizer-model']
      ? { optimizerModel: values['optimizer-model'] }
      : {}),
  })

  console.log(
    `[self-evolve-loop] stoppedReason=${result.stoppedReason} rounds=${result.rounds.length} bestRound=${result.bestRound ?? 0}`,
  )
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[self-evolve-loop] failed: ${message}`)
  process.exit(1)
})
