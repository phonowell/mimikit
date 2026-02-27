import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import getPort, { portNumbers } from 'get-port'

import { defaultConfig } from '../config.js'
import { buildPaths } from '../fs/paths.js'
import { createHttpServer } from '../http/index.js'
import { bestEffort, setDefaultLogPath } from '../log/safe.js'
import { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import { loadCodexSettings } from '../providers/openai-settings.js'

import { applyCliEnvOverrides } from './env.js'
import { acquireRuntimeLock } from './runtime-lock.js'

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

const parsePort = (value: string): number => {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return num
}

const requestedPort = parsePort(portValue)

const config = defaultConfig({
  workDir: resolvedWorkDir,
})

applyCliEnvOverrides(config)

console.log('[cli] config:', config)

const runtimeLock = await acquireRuntimeLock(resolvedWorkDir)
const orchestrator = new Orchestrator(config)

const resolveHttpPort = async (target: number): Promise<number> => {
  const max = Math.min(65535, target + 20)
  const port = await getPort({ port: portNumbers(target, max) })
  if (port !== target)
    console.warn(`[cli] port ${target} is in use, fallback to ${port}`)
  return port
}

const shutdown = async (reason: string, code = 0): Promise<never> => {
  console.log(`\n[cli] ${reason}`)
  await bestEffort('cli:release_runtime_lock', () => runtimeLock.release(), {
    meta: { reason },
  })
  await bestEffort('cli:stop_and_persist', () => orchestrator.stopAndPersist(), {
    meta: { reason },
  })
  process.exit(code)
}

try {
  await orchestrator.start()
  const listenPort = await resolveHttpPort(requestedPort)
  await createHttpServer(orchestrator, config, listenPort)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  await shutdown(`startup failed: ${message}`, 1)
}

process.on('SIGINT', () => {
  void shutdown('shutting down...')
})

process.on('SIGTERM', () => {
  void shutdown('received SIGTERM, shutting down...')
})
