import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { loadReplaySuite } from '../src/eval/replay-loader.js'
import { writeReplayReportJson } from '../src/eval/replay-report.js'
import { runReplaySuite } from '../src/eval/replay-runner.js'
import { decidePromptPromotion } from '../src/evolve/decision.js'
import {
  optimizeManagerPrompt,
  restorePrompt,
} from '../src/evolve/prompt-optimizer.js'
import { loadCodexSettings } from '../src/llm/openai.js'

type CliArgs = {
  suitePath: string
  outDir: string
  stateDir: string
  workDir: string
  promptPath: string
  timeoutMs: number
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

  if (!values.suite) throw new Error('--suite is required')

  return {
    suitePath: resolve(values.suite),
    outDir: resolve(values['out-dir']),
    stateDir: resolve(values['state-dir']),
    workDir: resolve(values['work-dir']),
    promptPath: resolve(values['prompt-path']),
    timeoutMs: values['timeout-ms']
      ? parsePositiveInteger(values['timeout-ms'], '--timeout-ms')
      : DEFAULT_TIMEOUT_MS,
    ...(values.model ? { model: values.model } : {}),
    ...(values['optimizer-model']
      ? { optimizerModel: values['optimizer-model'] }
      : {}),
  }
}

const writeDecision = async (
  outDir: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  const path = resolve(outDir, 'decision.json')
  await mkdir(resolve(outDir), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

const main = async () => {
  const args = parseCliArgs()
  await loadCodexSettings()
  const suite = await loadReplaySuite(args.suitePath)

  const baseline = await runReplaySuite({
    suite,
    stateDir: args.stateDir,
    workDir: args.workDir,
    timeoutMs: args.timeoutMs,
    ...(args.model ? { model: args.model } : {}),
    maxFail: Number.MAX_SAFE_INTEGER,
  })
  await writeReplayReportJson(resolve(args.outDir, 'baseline.json'), baseline)

  const optimized = await optimizeManagerPrompt({
    stateDir: args.stateDir,
    workDir: args.workDir,
    promptPath: args.promptPath,
    timeoutMs: args.timeoutMs,
    ...(args.optimizerModel ? { model: args.optimizerModel } : {}),
  })

  const candidate = await runReplaySuite({
    suite,
    stateDir: args.stateDir,
    workDir: args.workDir,
    timeoutMs: args.timeoutMs,
    ...(args.model ? { model: args.model } : {}),
    maxFail: Number.MAX_SAFE_INTEGER,
  })
  await writeReplayReportJson(resolve(args.outDir, 'candidate.json'), candidate)

  const decision = decidePromptPromotion(baseline, candidate)
  if (!decision.promote) {
    await restorePrompt(args.promptPath, optimized.original)
  }

  await writeDecision(args.outDir, {
    suite: suite.suite,
    promptPath: args.promptPath,
    promote: decision.promote,
    reason: decision.reason,
    baseline: {
      passRate: baseline.passRate,
      usageTotal: baseline.metrics.usage.total,
      llmElapsedMs: baseline.metrics.llmElapsedMs,
    },
    candidate: {
      passRate: candidate.passRate,
      usageTotal: candidate.metrics.usage.total,
      llmElapsedMs: candidate.metrics.llmElapsedMs,
    },
    reportPaths: {
      baseline: resolve(args.outDir, 'baseline.json'),
      candidate: resolve(args.outDir, 'candidate.json'),
    },
  })

  console.log(
    `[self-evolve] promote=${decision.promote} reason=${decision.reason} baseline.passRate=${baseline.passRate} candidate.passRate=${candidate.passRate}`,
  )
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[self-evolve] failed: ${message}`)
  process.exit(1)
})
