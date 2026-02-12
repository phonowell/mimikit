import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { defaultConfig } from '../config.js'
import { buildPaths } from '../fs/paths.js'
import { createHttpServer } from '../http/index.js'
import { setDefaultLogPath } from '../log/safe.js'
import { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import { loadCodexSettings } from '../providers/openai-settings.js'

import { applyCliEnvOverrides } from './env.js'

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '8787' },
    'work-dir': { type: 'string', default: '.mimikit' },
  },
})

const portValue = values.port
const workDir = values['work-dir']

const resolvedWorkDir = resolve(workDir)
setDefaultLogPath(buildPaths(resolvedWorkDir).log)
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
