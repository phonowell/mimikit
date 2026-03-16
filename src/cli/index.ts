import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'

import getPort, { portNumbers } from 'get-port'

import { defaultConfig } from '../config.js'
import { buildPaths } from '../fs/paths.js'
import { setDefaultLogPath } from '../log/safe.js'
import { configureManagerActionCliLogger } from '../manager/action-cli-log.js'
import { loadCodexSettings } from '../providers/codex-settings.js'

import { warnIgnoredUnknownConfigKeys } from './config-warning.js'
import { applyCliEnvOverrides } from './env.js'
import { runCliCycle } from './runtime-cycle.js'

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

const parsePort = (value: string): number => {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return num
}

const resolveHttpPort = async (target: number): Promise<number> => {
  const max = Math.min(65535, target + 20)
  const port = await getPort({ port: portNumbers(target, max) })
  if (port !== target)
    console.warn(`[cli] port ${target} is in use, fallback to ${port}`)
  return port
}

const waitForPortRelease = async (port: number): Promise<void> => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const released = await new Promise<boolean>((resolveRelease, reject) => {
      const probe = createServer()
      probe.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          resolveRelease(false)
          return
        }
        reject(error)
      })
      probe.listen(port, '127.0.0.1', () => {
        probe.close((error) => {
          if (error) reject(error)
          else resolveRelease(true)
        })
      })
    })
    if (released) return
    await delay(100)
  }
  throw new Error(`[cli] port ${port} did not release in time`)
}

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p' },
    'work-dir': { type: 'string', default: '.mimikit' },
    'log-actions': { type: 'string' },
  },
})

const portValue = values.port
const workDir = resolve(values['work-dir'])
const logActionsFlag = parseBoolFlag('log-actions', values['log-actions'])
const paths = buildPaths(workDir)
setDefaultLogPath(paths.log)
configureManagerActionCliLogger({
  ...(logActionsFlag !== undefined ? { enabled: logActionsFlag } : {}),
  logPath: paths.log,
})
await loadCodexSettings()

const config = defaultConfig({
  workDir,
  onUnknownConfigKeys: (keys) =>
    warnIgnoredUnknownConfigKeys(keys, (message) => console.warn(message)),
})
applyCliEnvOverrides(config)
if (logActionsFlag !== undefined)
  configureManagerActionCliLogger({ enabled: logActionsFlag })

console.log('[cli] config loaded')

const targetPort =
  typeof portValue === 'string' ? parsePort(portValue) : config.webui.port

let requestShutdown: ((reason: string, code?: number) => void) | null = null
let restartPort: number | null = null

process.on('SIGINT', () => {
  requestShutdown?.('shutting down...')
})
process.on('SIGTERM', () => {
  requestShutdown?.('received SIGTERM, shutting down...')
})

for (;;) {
  const listenPort: number | null =
    restartPort ??
    (config.webui.enabled ? await resolveHttpPort(targetPort) : null)
  const exitCode = await runCliCycle({
    config,
    workDir,
    paths,
    port: listenPort,
    onShutdownReady: (shutdown) => {
      requestShutdown = shutdown
    },
  })
  requestShutdown = null
  if (exitCode !== 75) process.exit(exitCode)
  if (listenPort !== null) {
    await waitForPortRelease(listenPort)
    restartPort = listenPort
  }
  console.log('[cli] restarting...')
}
