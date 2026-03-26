import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { loadCodexSettings } from '../../execution/providers/codex-settings.js'
import { buildPaths } from '../../persistence/fs/paths.js'
import { setDefaultLogPath } from '../../persistence/log/safe.js'
import { configureManagerActionCliLogger } from '../../policy/manager/action-cli-log.js'
import { defaultConfig } from '../config.js'

import { warnIgnoredUnknownConfigKeys } from './config-warning.js'
import { applyCliEnvOverrides } from './env.js'
import { parsePort, resolveHttpPort, waitForPortRelease } from './port.js'
import { runRuntimeChild, RUNTIME_CHILD_ENV } from './runtime-child.js'
import { findActiveRuntimeOwner } from './runtime-lock.js'
import { recoverUnhealthyRuntimeOwner } from './runtime-owner-health.js'
import { formatWorkDirInUseMessage, runSupervisor } from './supervisor.js'

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

const cliRoleLabel =
  process.env[RUNTIME_CHILD_ENV] === '1' ? 'runtime' : 'supervisor'
console.log(`[cli:${cliRoleLabel}] config loaded`)

const targetPort =
  typeof portValue === 'string' ? parsePort(portValue) : config.webui.port

if (process.env[RUNTIME_CHILD_ENV] === '1') {
  await runRuntimeChild({
    config,
    workDir,
    paths,
    targetPort,
  })
}
let existingRuntimeOwner = await findActiveRuntimeOwner(workDir)
if (existingRuntimeOwner) {
  const recovered = await recoverUnhealthyRuntimeOwner({
    workDir,
    owner: existingRuntimeOwner,
    port: config.webui.enabled ? targetPort : null,
  })
  if (recovered) {
    console.warn(
      `[cli:supervisor] recovered unhealthy runtime owner: pid=${existingRuntimeOwner.ownerPid}`,
    )
    existingRuntimeOwner = await findActiveRuntimeOwner(workDir)
  }
}
if (existingRuntimeOwner) {
  console.error(
    formatWorkDirInUseMessage({
      workDir,
      owner: existingRuntimeOwner,
    }),
  )
  process.exit(1)
}
await runSupervisor({
  config,
  targetPort,
  runtimeChildEnv: RUNTIME_CHILD_ENV,
  resolveHttpPort,
  waitForPortRelease,
})
