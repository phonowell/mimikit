import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { loadCodexSettings } from '../../execution/providers/codex-settings.js'
import { sleep } from '../../foundation/shared/utils.js'
import { buildPaths } from '../../persistence/fs/paths.js'
import { setDefaultLogPath } from '../../persistence/log/safe.js'
import { configureManagerActionCliLogger } from '../../policy/manager/action-cli-log.js'
import { defaultConfig } from '../config.js'

import { warnIgnoredUnknownConfigKeys } from './config-warning.js'
import { applyCliEnvOverrides } from './env.js'
import { parsePort, resolveHttpPort, waitForPortRelease } from './port.js'
import { runCliCycle } from './runtime-cycle.js'
import { findActiveRuntimeOwner } from './runtime-lock.js'
import { recoverUnhealthyRuntimeOwner } from './runtime-owner-health.js'

import type { ActiveRuntimeOwner } from './runtime-lock.js'

const CRASH_RESTART_DELAY_MS = 500
const RUNTIME_CHILD_ENV = 'MIMIKIT_RUNTIME_CHILD'

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

const formatCliStartupFailure = (
  scope: 'runtime' | 'supervisor',
  error: unknown,
): string => {
  const message = error instanceof Error ? error.message : String(error)
  return `[cli:${scope}] startup failed: ${message}`
}

const formatWorkDirInUseMessage = (params: {
  workDir: string
  owner: ActiveRuntimeOwner
}): string =>
  `[cli:supervisor] work-dir already in use: ${params.workDir} (ownerPid=${params.owner.ownerPid}, runtimeId=${params.owner.runtimeId}${params.owner.updatedAt ? `, updatedAt=${params.owner.updatedAt}` : ''}). Stop the existing instance or use --work-dir.`

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

const stripPortArgs = (argv: readonly string[]): string[] => {
  const nextArgs: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg) continue
    if (arg === '--port' || arg === '-p') {
      index += 1
      continue
    }
    if (arg.startsWith('--port=')) continue
    nextArgs.push(arg)
  }
  return nextArgs
}

const buildChildArgs = (port: number | null): string[] => {
  const scriptPath = process.argv[1]
  if (!scriptPath)
    throw new Error('[cli] missing script path for runtime child')
  const cliArgs = stripPortArgs(process.argv.slice(2))
  return port === null
    ? [...process.execArgv, scriptPath, ...cliArgs]
    : [...process.execArgv, scriptPath, ...cliArgs, '--port', String(port)]
}

const runRuntimeChild = async (): Promise<never> => {
  let requestShutdown: ((reason: string, code?: number) => void) | null = null

  process.on('SIGINT', () => {
    requestShutdown?.('shutting down...')
  })
  process.on('SIGTERM', () => {
    requestShutdown?.('received SIGTERM, shutting down...')
  })

  const listenPort: number | null = config.webui.enabled ? targetPort : null
  try {
    const exitCode = await runCliCycle({
      config,
      workDir,
      paths,
      port: listenPort,
      onShutdownReady: (shutdown) => {
        requestShutdown = shutdown
      },
      onReady: () => {
        if (typeof process.send === 'function') process.send({ type: 'ready' })
      },
    })
    process.exit(exitCode)
  } catch (error) {
    console.error(formatCliStartupFailure('runtime', error))
    process.exit(1)
  }
}

const runSupervisor = async (): Promise<never> => {
  let activeChild: ReturnType<typeof spawn> | null = null
  const state = { shutdownSignal: null as NodeJS.Signals | null }
  let restartPort: number | null = null

  const forwardSignal = (signal: NodeJS.Signals): void => {
    state.shutdownSignal = signal
    activeChild?.kill(signal)
  }

  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))

  for (;;) {
    const listenPort: number | null =
      restartPort ??
      (config.webui.enabled ? await resolveHttpPort(targetPort) : null)
    const child = spawn(process.execPath, buildChildArgs(listenPort), {
      cwd: process.cwd(),
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: {
        ...process.env,
        [RUNTIME_CHILD_ENV]: '1',
      },
    })
    activeChild = child

    let ready = false
    child.on('message', (message) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'ready'
      )
        ready = true
    })

    const result = await new Promise<{
      code: number
      ready: boolean
    }>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        const exitCode = typeof code === 'number' ? code : signal ? 128 : 1
        resolve({ code: exitCode, ready })
      })
    })
    activeChild = null

    if (state.shutdownSignal !== null) process.exit(result.code)
    if (result.code === 75) {
      if (listenPort !== null) {
        await waitForPortRelease(listenPort)
        restartPort = listenPort
      }
      console.log('[cli] restarting...')
      continue
    }
    if (result.code === 0) process.exit(0)
    if (!result.ready) process.exit(result.code)
    if (listenPort !== null) {
      await waitForPortRelease(listenPort)
      restartPort = listenPort
    }
    console.log(
      `[cli] child exited unexpectedly (${result.code}), restarting...`,
    )
    await sleep(CRASH_RESTART_DELAY_MS)
  }
}

if (process.env[RUNTIME_CHILD_ENV] === '1') await runRuntimeChild()
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
await runSupervisor()
