import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { createHttpServer } from './http.js'
import { Supervisor } from './supervisor.js'

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
const selfAwakeIntervalValue = values['self-awake-interval']

const port = parsePort(portValue)
const checkIntervalMs =
  parsePositiveNumber(checkIntervalValue, 'check-interval') * 1000
const selfAwakeIntervalMs =
  parsePositiveNumber(selfAwakeIntervalValue, 'self-awake-interval') * 1000

const config = {
  stateDir: resolve(stateDir),
  workDir: resolve(workDir),
  model: values.model,
  checkIntervalMs,
  selfAwakeIntervalMs,
}

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

function parsePort(value: string): string {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return String(num)
}

function parsePositiveNumber(value: string, name: string): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) {
    console.error(`[cli] invalid ${name}: ${value}`)
    process.exit(1)
  }
  return num
}
