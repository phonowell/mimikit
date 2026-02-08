import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { applyCliEnvOverrides } from './cli-env.js'
import { defaultConfig } from './config.js'
import { buildPaths } from './fs/paths.js'
import { createHttpServer } from './http/index.js'
import { loadCodexSettings } from './llm/openai.js'
import { setDefaultLogPath } from './log/safe.js'
import { Orchestrator } from './orchestrator/orchestrator.js'

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

applyCliEnvOverrides(config)

console.log('[cli] config:', config)

const orchestrator = new Orchestrator(config)

await orchestrator.start()
createHttpServer(orchestrator, config, parseInt(port, 10))

const shutdown = (reason: string) => {
  console.log(`\n[cli] ${reason}`)
  void (async () => {
    await orchestrator.stopAndPersist()
    process.exit(0)
  })()
}

process.on('SIGINT', () => {
  shutdown('shutting down...')
})

process.on('SIGTERM', () => {
  shutdown('received SIGTERM, shutting down...')
})
