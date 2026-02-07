import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import {
  loadReplaySuiteBundle,
  type ReplaySuiteBundle,
} from '../src/eval/replay-loader.js'
import { buildPromotionPolicy } from '../src/evolve/loop-stop.js'
import { runSelfEvolveMultiRound } from '../src/evolve/multi-round.js'
import { runSelfEvolveRound } from '../src/evolve/round.js'
import { loadCodexSettings } from '../src/llm/openai.js'

type CliArgs = {
  suitePath: string
  outDir: string
  stateDir: string
  workDir: string
  promptPath: string
  timeoutMs: number
  minPassRateDelta?: number
  minTokenDelta?: number
  minLatencyDeltaMs?: number
  bundlePath?: string
  model?: string
  optimizerModel?: string
}

const DEFAULT_TIMEOUT_MS = 30_000
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

const parseCliArgs = (): CliArgs => {
  const rawArgs = process.argv.slice(2)
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      suite: { type: 'string' },
      'out-dir': { type: 'string', default: '.mimikit/generated/evolve' },
      'state-dir': { type: 'string', default: '.mimikit/generated/evolve/state' },
      'work-dir': { type: 'string', default: '.' },
      'prompt-path': { type: 'string', default: DEFAULT_PROMPT_PATH },
      'timeout-ms': { type: 'string' },
      'min-pass-rate-delta': { type: 'string' },
      'min-token-delta': { type: 'string' },
      'min-latency-delta-ms': { type: 'string' },
      bundle: { type: 'string' },
      model: { type: 'string' },
      'optimizer-model': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    console.log(
      'Usage: pnpm self:evolve -- --suite <path> [--out-dir <path>] [--state-dir <path>] [--work-dir <path>] [--prompt-path <path>] [--timeout-ms <n>] [--model <name>] [--optimizer-model <name>]',
    )
    process.exit(0)
  }

  if (!values.suite && !values.bundle)
    throw new Error('--suite is required (or provide --bundle)')

  return {
    suitePath: values.suite ? resolve(values.suite) : '',
    outDir: resolve(values['out-dir']),
    stateDir: resolve(values['state-dir']),
    workDir: resolve(values['work-dir']),
    promptPath: resolve(values['prompt-path']),
    timeoutMs: values['timeout-ms']
      ? parsePositiveInteger(values['timeout-ms'], '--timeout-ms')
      : DEFAULT_TIMEOUT_MS,
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
    ...(values.bundle ? { bundlePath: resolve(values.bundle) } : {}),
    ...(values.model ? { model: values.model } : {}),
    ...(values['optimizer-model']
      ? { optimizerModel: values['optimizer-model'] }
      : {}),
  }
}

const main = async () => {
  const args = parseCliArgs()
  await loadCodexSettings()
  const policy = buildPromotionPolicy({
    ...(args.minPassRateDelta !== undefined
      ? { minPassRateDelta: args.minPassRateDelta }
      : {}),
    ...(args.minTokenDelta !== undefined
      ? { minTokenDelta: args.minTokenDelta }
      : {}),
    ...(args.minLatencyDeltaMs !== undefined
      ? { minLatencyDeltaMs: args.minLatencyDeltaMs }
      : {}),
  })

  if (args.bundlePath) {
    const bundle: ReplaySuiteBundle = await loadReplaySuiteBundle(args.bundlePath)
    const result = await runSelfEvolveMultiRound({
      suites: bundle.suites,
      outDir: args.outDir,
      stateDir: args.stateDir,
      workDir: args.workDir,
      promptPath: args.promptPath,
      timeoutMs: args.timeoutMs,
      promotionPolicy: policy,
      ...(args.model ? { model: args.model } : {}),
      ...(args.optimizerModel ? { optimizerModel: args.optimizerModel } : {}),
    })
    console.log(
      `[self-evolve] bundle_mode promote=${result.promote} reason=${result.reason} baseline.weightedPassRate=${result.baseline.weightedPassRate} candidate.weightedPassRate=${result.candidate.weightedPassRate}`,
    )
    return
  }

  const result = await runSelfEvolveRound({
    suitePath: args.suitePath,
    outDir: args.outDir,
    stateDir: args.stateDir,
    workDir: args.workDir,
    promptPath: args.promptPath,
    timeoutMs: args.timeoutMs,
    promotionPolicy: policy,
    ...(args.model ? { model: args.model } : {}),
    ...(args.optimizerModel ? { optimizerModel: args.optimizerModel } : {}),
  })

  console.log(
    `[self-evolve] promote=${result.promote} reason=${result.reason} baseline.passRate=${result.baseline.passRate} candidate.passRate=${result.candidate.passRate}`,
  )
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[self-evolve] failed: ${message}`)
  process.exit(1)
})
