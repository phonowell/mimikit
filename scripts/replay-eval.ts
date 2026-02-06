import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { loadCodexSettings } from '../src/llm/openai.js'

import { loadReplaySuite } from '../src/eval/replay-loader.js'
import {
  writeReplayReportJson,
  writeReplayReportMarkdown,
} from '../src/eval/replay-report.js'
import {
  resolveReplayExitCode,
  runReplaySuite,
} from '../src/eval/replay-runner.js'
import {
  ReplayExitCode,
  ReplaySuiteFormatError,
} from '../src/eval/replay-types.js'

const DEFAULT_MANAGER_TIMEOUT_MS = 30_000
const DEFAULT_MAX_FAIL = Number.MAX_SAFE_INTEGER

type CliArgs = {
  suitePath: string
  outputPath: string
  markdownPath: string
  model?: string
  seed?: number
  temperature?: number
  offline?: boolean
  preferArchive?: boolean
  archiveDir?: string
  maxFail: number
  timeoutMs: number
  stateDir: string
  workDir: string
}

const usage = () => {
  console.log(
    'Usage: pnpm replay:eval -- --suite <path> --out <path> [--md <path>] [--model <name>] [--seed <int>] [--temperature <num>] [--offline] [--prefer-archive] [--archive-dir <path>] [--max-fail <n>] [--timeout-ms <n>] [--state-dir <path>] [--work-dir <path>]',
  )
}

const parsePositiveInteger = (raw: string | undefined, label: string): number => {
  if (!raw) throw new Error(`${label} requires a value`)
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

const parseInteger = (raw: string | undefined, label: string): number => {
  if (raw === undefined) throw new Error(`${label} requires a value`)
  const value = Number(raw)
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`)
  }
  return value
}

const parseFiniteNumber = (raw: string | undefined, label: string): number => {
  if (raw === undefined) throw new Error(`${label} requires a value`)
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

const parseCliArgs = (): CliArgs => {
  const rawArgs = process.argv.slice(2)
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs
  const { values } = parseArgs({
    args,
    options: {
      suite: { type: 'string' },
      out: { type: 'string' },
      md: { type: 'string' },
      model: { type: 'string' },
      seed: { type: 'string' },
      temperature: { type: 'string' },
      offline: { type: 'boolean' },
      'prefer-archive': { type: 'boolean' },
      'archive-dir': { type: 'string' },
      'max-fail': { type: 'string' },
      'timeout-ms': { type: 'string' },
      'state-dir': { type: 'string', default: '.mimikit/generated/replay/state' },
      'work-dir': { type: 'string', default: '.' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.help) {
    usage()
    process.exit(0)
  }

  if (!values.suite || !values.out) {
    throw new Error('--suite and --out are required')
  }

  const resolvedOutput = resolve(values.out)
  return {
    suitePath: resolve(values.suite),
    outputPath: resolvedOutput,
    markdownPath: values.md
      ? resolve(values.md)
      : resolvedOutput.endsWith('.json')
        ? `${resolvedOutput.slice(0, -5)}.md`
        : `${resolvedOutput}.md`,
    ...(values.model ? { model: values.model } : {}),
    ...(values.seed !== undefined
      ? { seed: parseInteger(values.seed, '--seed') }
      : {}),
    ...(values.temperature !== undefined
      ? { temperature: parseFiniteNumber(values.temperature, '--temperature') }
      : {}),
    ...(values.offline === true ? { offline: true } : {}),
    ...(values['prefer-archive'] === true ? { preferArchive: true } : {}),
    ...(values['archive-dir']
      ? { archiveDir: resolve(values['archive-dir']) }
      : {}),
    maxFail: values['max-fail']
      ? parsePositiveInteger(values['max-fail'], '--max-fail')
      : DEFAULT_MAX_FAIL,
    timeoutMs: values['timeout-ms']
      ? parsePositiveInteger(values['timeout-ms'], '--timeout-ms')
      : DEFAULT_MANAGER_TIMEOUT_MS,
    stateDir: resolve(values['state-dir']),
    workDir: resolve(values['work-dir']),
  }
}

const main = async () => {
  let args: CliArgs
  try {
    args = parseCliArgs()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    usage()
    process.exit(ReplayExitCode.RuntimeError)
    return
  }

  try {
    await loadCodexSettings()
    const suite = await loadReplaySuite(args.suitePath)
    const report = await runReplaySuite({
      suite,
      stateDir: args.stateDir,
      workDir: args.workDir,
      timeoutMs: args.timeoutMs,
      ...(args.model ? { model: args.model } : {}),
      ...(args.seed !== undefined ? { seed: args.seed } : {}),
      ...(args.temperature !== undefined
        ? { temperature: args.temperature }
        : {}),
      ...(args.offline ? { offline: true } : {}),
      ...(args.preferArchive ? { preferArchive: true } : {}),
      ...(args.archiveDir ? { archiveDir: args.archiveDir } : {}),
      maxFail: args.maxFail,
    })

    await writeReplayReportJson(args.outputPath, report)
    await writeReplayReportMarkdown(args.markdownPath, report)

    const exitCode = resolveReplayExitCode(report)
    console.log(`suite: ${report.suite}`)
    console.log(
      `result: passed=${report.passed} failed=${report.failed} total=${report.total} passRate=${report.passRate}`,
    )
    console.log(`json: ${args.outputPath}`)
    console.log(`md: ${args.markdownPath}`)
    process.exit(exitCode)
  } catch (error) {
    if (error instanceof ReplaySuiteFormatError) {
      console.error(`suite format error: ${error.message}`)
      process.exit(ReplayExitCode.RuntimeError)
      return
    }
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(ReplayExitCode.RuntimeError)
  }
}

main()
