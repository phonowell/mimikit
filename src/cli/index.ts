import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { loadCodexSettings } from '@mimikit/providers/providers/codex-settings'
import getPort, { portNumbers } from 'get-port'

import { defaultConfig } from '../config.js'
import { buildPaths } from '../fs/paths.js'
import { createHttpServer } from '../http/index.js'
import { bestEffort, setDefaultLogPath } from '../log/safe.js'
import { configureManagerActionCliLogger } from '../manager/action-cli-log.js'
import { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import { setRuntimeReaperBridge } from '../runtime/reaper-bridge.js'
import { createRuntimeReaperHandle } from '../runtime/reaper.js'

import { warnIgnoredUnknownConfigKeys } from './config-warning.js'
import { applyCliEnvOverrides } from './env.js'
import { acquireRuntimeLock } from './runtime-lock.js'

const parseBoolFlag = (
  flagName: string,
  value: string | undefined,
): boolean | undefined => {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === '1' || normalized === 'true' || normalized === 'yes')
    return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no')
    return false
  console.error(`[cli] invalid ${flagName}: ${value}`)
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p' },
    'work-dir': { type: 'string', default: '.mimikit' },
    'log-actions': { type: 'string' },
  },
})

const portValue = values.port
const workDir = values['work-dir']
const logActionsFlag = parseBoolFlag('log-actions', values['log-actions'])

const resolvedWorkDir = resolve(workDir)
const paths = buildPaths(resolvedWorkDir)
setDefaultLogPath(paths.log)
configureManagerActionCliLogger({
  ...(logActionsFlag !== undefined ? { enabled: logActionsFlag } : {}),
  logPath: paths.log,
})
await loadCodexSettings()

const parsePort = (value: string): number => {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return num
}

const config = defaultConfig({
  workDir: resolvedWorkDir,
  onUnknownConfigKeys: (keys) =>
    warnIgnoredUnknownConfigKeys(keys, (message) => console.warn(message)),
})

applyCliEnvOverrides(config)
if (logActionsFlag !== undefined)
  configureManagerActionCliLogger({ enabled: logActionsFlag })

console.log('[cli] config loaded')

const runtimeLock = await acquireRuntimeLock(resolvedWorkDir)
const runtimeId = process.pid > 0 ? `runtime-${process.pid}` : 'runtime-main'
const runtimeReaper = await createRuntimeReaperHandle({
  runtimeId,
  paths,
  runtimeLock,
  logPath: paths.log,
})
await runtimeReaper.startHeartbeat()
setRuntimeReaperBridge({
  onRuntimeChildStarted: (child) =>
    runtimeReaper.registerChild({
      id: child.id,
      kind: child.kind,
      pid: child.pid,
      ...(child.meta ? { meta: child.meta } : {}),
    }),
  onRuntimeChildStopped: (id) => runtimeReaper.unregisterChild(id),
})
let shutdownPromise: Promise<never> | null = null

const resolveHttpPort = async (target: number): Promise<number> => {
  const max = Math.min(65535, target + 20)
  const port = await getPort({ port: portNumbers(target, max) })
  if (port !== target)
    console.warn(`[cli] port ${target} is in use, fallback to ${port}`)
  return port
}

const shutdown = (
  reason: string,
  code = 0,
  options?: { skipPersist?: boolean },
): Promise<never> => {
  if (shutdownPromise) return shutdownPromise
  shutdownPromise = (async () => {
    console.log(`\n[cli] ${reason}`)
    await bestEffort('cli:stop_runtime_reaper_heartbeat', () =>
      runtimeReaper.stopHeartbeat(),
    )
    setRuntimeReaperBridge(null)
    await bestEffort('cli:release_runtime_lock', () => runtimeLock.release(), {
      meta: { reason },
    })
    if (!options?.skipPersist) {
      await bestEffort(
        'cli:stop_and_persist',
        () => orchestrator.stopAndPersist(),
        {
          meta: { reason },
        },
      )
    }
    process.exit(code)
  })()
  return shutdownPromise
}

const orchestrator = new Orchestrator(config, {
  onExitRequested: ({ code, reason }) => {
    void shutdown(`orchestrator exit requested: ${reason}`, code, {
      skipPersist: reason === 'http_api_reset',
    })
  },
})

try {
  await orchestrator.start()
  if (!config.webui.enabled)
    console.log('[cli] webui disabled by config: webui.enabled=false')
  else {
    const targetPort =
      typeof portValue === 'string' ? parsePort(portValue) : config.webui.port
    const listenPort = await resolveHttpPort(targetPort)
    await createHttpServer(orchestrator, config, listenPort)
  }
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
