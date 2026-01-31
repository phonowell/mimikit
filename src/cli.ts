import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { defaultConfig } from './config.js'
import { createHttpServer } from './http/index.js'
import { runMemoryCli } from './memory/cli.js'
import { Supervisor } from './supervisor/supervisor.js'

const args = process.argv.slice(2)
if (args[0] === 'memory') {
  await runMemoryCli(args.slice(1))
  process.exit(0)
}

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '8787' },
    'state-dir': { type: 'string', default: '.mimikit' },
    'work-dir': { type: 'string', default: '.' },
    model: { type: 'string' },
    'check-interval': { type: 'string', default: '1' },
    'self-awake-interval': { type: 'string', default: '300' },
  },
})

const portValue = values.port
const stateDir = values['state-dir']
const workDir = values['work-dir']
const checkIntervalValue = values['check-interval']

const parsePort = (value: string): string => {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return String(num)
}

const parsePositiveNumber = (value: string, name: string): number => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) {
    console.error(`[cli] invalid ${name}: ${value}`)
    process.exit(1)
  }
  return num
}

const port = parsePort(portValue)
const checkIntervalMs =
  parsePositiveNumber(checkIntervalValue, 'check-interval') * 1000

const config = defaultConfig({
  stateDir: resolve(stateDir),
  workDir: resolve(workDir),
  model: values.model,
  checkIntervalMs,
})

console.log('[cli] config:', config)

const supervisor = new Supervisor(config)

await supervisor.start()
createHttpServer(supervisor, parseInt(port, 10))

process.on('SIGINT', () => {
  console.log('\n[cli] shutting down...')
  supervisor.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[cli] received SIGTERM, shutting down...')
  supervisor.stop()
  process.exit(0)
})
