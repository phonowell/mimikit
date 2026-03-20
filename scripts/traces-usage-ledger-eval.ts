import { resolve } from 'node:path'

import { runTraceUsageLedgerEval } from './traces-usage-ledger-eval-core.js'
import { renderTraceUsageLedgerEvalReport } from './traces-usage-ledger-eval-render.js'

const parseArgs = (argv: string[]) => {
  const options = {
    manifest: 'tests/fixtures/traces-usage-ledger-eval/manifest.json',
    format: 'human',
    scenario: '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]
    if (token === '--manifest' && next) {
      options.manifest = next
      index += 1
      continue
    }
    if (token === '--format' && next) {
      options.format = next
      index += 1
      continue
    }
    if (token === '--scenario' && next) {
      options.scenario = next
      index += 1
      continue
    }
    if (token === '--help' || token === '-h') {
      options.format = 'help'
      continue
    }
    throw new Error(`unknown arg: ${token}`)
  }
  if (!['human', 'json', 'help'].includes(options.format))
    throw new Error('--format must be human or json')
  return options
}

const printHelp = (): void => {
  process.stdout.write('Trace / usage ledger eval\n\n')
  process.stdout.write(
    'Usage: tsx scripts/traces-usage-ledger-eval.ts [--manifest path] [--scenario name] [--format human|json]\n',
  )
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  if (options.format === 'help') {
    printHelp()
    return
  }
  const report = await runTraceUsageLedgerEval({
    manifestPath: resolve(options.manifest),
    ...(options.scenario.trim() ? { scenario: options.scenario.trim() } : {}),
  })
  if (options.format === 'json') console.log(JSON.stringify(report, null, 2))
  else console.log(renderTraceUsageLedgerEvalReport(report))
  if (!report.passed) process.exitCode = 1
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[traces-usage-ledger-eval] ${message}`)
  process.exitCode = 1
})
