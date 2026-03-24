import { resolve } from 'node:path'

import { buildReport, writeSampleReport } from './worker-budget-report-lib.ts'
import { renderHumanReport } from './worker-budget-report-render.ts'

const parseArgs = (argv: string[]) => {
  const options = {
    workDir: '.mimikit',
    format: 'human',
    writeSample: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]
    if ((token === '--work-dir' || token === '--base-dir') && next) {
      options.workDir = next
      index += 1
      continue
    }
    if (token === '--format' && next) {
      options.format = next
      index += 1
      continue
    }
    if (token === '--write-sample') {
      options.writeSample = true
      continue
    }
    if (token === '--help' || token === '-h') {
      options.format = 'help'
      continue
    }
    throw new Error(`unknown arg: ${token}`)
  }
  if (
    options.format !== 'human' &&
    options.format !== 'json' &&
    options.format !== 'help'
  ) {
    throw new Error('--format must be human or json')
  }
  return options
}

const printHelp = () => {
  process.stdout.write('Worker budget report\n\n')
  process.stdout.write(
    'Usage: tsx scripts/worker-budget-report.ts [--work-dir .mimikit] [--format human|json] [--write-sample]\n',
  )
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.format === 'help') {
    printHelp()
    return
  }
  const workDir = resolve(options.workDir)
  const report = await buildReport(workDir)
  if (options.writeSample) {
    const outputPath = await writeSampleReport(workDir, report)
    process.stderr.write(`sample_report=${outputPath}\n`)
  }
  if (options.format === 'json') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }
  process.stdout.write(renderHumanReport(report))
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[worker-budget-report] ${message}\n`)
  process.exitCode = 1
})
