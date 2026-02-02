import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { defaultConfig } from './config.js'
import { buildPaths } from './fs/paths.js'
import { createHttpServer } from './http/index.js'
import { loadCodexSettings } from './llm/openai.js'
import { safe, setDefaultLogPath } from './log/safe.js'
import { acquireInstanceLock } from './storage/instance-lock.js'
import { Supervisor } from './supervisor/supervisor.js'

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '8787' },
    'state-dir': { type: 'string', default: '.mimikit' },
    'work-dir': { type: 'string', default: '.' },
  },
})

const portValue = values.port
const stateDir = values['state-dir']
const workDir = values['work-dir']

const resolvedStateDir = resolve(stateDir)
const resolvedWorkDir = resolve(workDir)
setDefaultLogPath(buildPaths(resolvedStateDir).log)
const instanceLock = await acquireInstanceLock(resolvedStateDir)
await loadCodexSettings()

const parsePort = (value: string): string => {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return String(num)
}

const port = parsePort(portValue)

const config = defaultConfig({
  stateDir: resolvedStateDir,
  workDir: resolvedWorkDir,
})

const envModel = process.env.MIMIKIT_TELLER_MODEL?.trim()
if (envModel) config.teller.model = envModel

console.log('[cli] config:', config)
console.log('[cli] instance lock:', instanceLock.lockPath)

const supervisor = new Supervisor(config)

await supervisor.start()
createHttpServer(supervisor, config, parseInt(port, 10))

const shutdown = async (reason: string) => {
  console.log(`\n[cli] ${reason}`)
  supervisor.stop()
  await safe('instanceLock.release', () => instanceLock.release(), {
    fallback: undefined,
  })
  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown('shutting down...')
})

process.on('SIGTERM', () => {
  void shutdown('received SIGTERM, shutting down...')
})
