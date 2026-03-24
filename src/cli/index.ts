import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { defaultConfig } from '../config.js'
import { buildPaths } from '../fs/paths.js'
import { setDefaultLogPath } from '../log/safe.js'
import { configureManagerActionCliLogger } from '../manager/action-cli-log.js'
import { loadCodexSettings } from '../providers/codex-settings.js'

import { warnIgnoredUnknownConfigKeys } from './config-warning.js'
import { applyCliEnvOverrides } from './env.js'
import { parsePort, resolveHttpPort, waitForPortRelease } from './port.js'
import {
  runFreshProcessRestartLoop,
  STARTED_BY_RESPAWN_CHILD,
} from './restart-loop.js'
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
  if (STARTED_BY_RESPAWN_CHILD) process.exit(exitCode)
  if (listenPort !== null) {
    await waitForPortRelease(listenPort)
    restartPort = listenPort
  }
  console.log('[cli] restarting...')
  await runFreshProcessRestartLoop(restartPort)
}
