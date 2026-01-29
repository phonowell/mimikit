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
    'self-awake-interval': { type: 'string', default: '900' },
  },
})

const port = values.port ?? '8787'
const stateDir = values['state-dir'] ?? '.mimikit'
const workDir = values['work-dir'] ?? '.'
const checkInterval = values['check-interval'] ?? '1'
const selfAwakeInterval = values['self-awake-interval'] ?? '900'

const config = {
  stateDir: resolve(stateDir),
  workDir: resolve(workDir),
  model: values.model,
  checkIntervalMs: parseInt(checkInterval, 10) * 1000,
  selfAwakeIntervalMs: parseInt(selfAwakeInterval, 10) * 1000,
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
