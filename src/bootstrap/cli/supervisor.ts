import { spawn } from 'node:child_process'

import { sleep } from '../../foundation/shared/utils.js'

import type { ActiveRuntimeOwner } from './runtime-lock.js'
import type { AppConfig } from '../config.js'

const CRASH_RESTART_DELAY_MS = 500

const formatCliStartupFailure = (
  scope: 'runtime' | 'supervisor',
  error: unknown,
): string => {
  const message = error instanceof Error ? error.message : String(error)
  return `[cli:${scope}] startup failed: ${message}`
}

export const formatWorkDirInUseMessage = (params: {
  workDir: string
  owner: ActiveRuntimeOwner
}): string =>
  `[cli:supervisor] work-dir already in use: ${params.workDir} (ownerPid=${params.owner.ownerPid}, runtimeId=${params.owner.runtimeId}${params.owner.updatedAt ? `, updatedAt=${params.owner.updatedAt}` : ''}). Stop the existing instance or use --work-dir.`

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

export const runSupervisor = async (params: {
  config: AppConfig
  targetPort: number
  runtimeChildEnv: string
  resolveHttpPort: (targetPort: number) => Promise<number>
  waitForPortRelease: (port: number) => Promise<void>
}): Promise<never> => {
  let activeChild: ReturnType<typeof spawn> | null = null
  const state = { shutdownSignal: null as NodeJS.Signals | null }
  let restartPort: number | null = null

  const forwardSignal = (signal: NodeJS.Signals): void => {
    state.shutdownSignal = signal
    activeChild?.kill(signal)
  }

  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))

  try {
    for (;;) {
      const listenPort: number | null =
        restartPort ??
        (params.config.webui.enabled
          ? await params.resolveHttpPort(params.targetPort)
          : null)
      const child = spawn(process.execPath, buildChildArgs(listenPort), {
        cwd: process.cwd(),
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: {
          ...process.env,
          [params.runtimeChildEnv]: '1',
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
          await params.waitForPortRelease(listenPort)
          restartPort = listenPort
        }
        console.log('[cli] restarting...')
        continue
      }
      if (result.code === 0) process.exit(0)
      if (!result.ready) process.exit(result.code)
      if (listenPort !== null) {
        await params.waitForPortRelease(listenPort)
        restartPort = listenPort
      }
      console.log(
        `[cli] child exited unexpectedly (${result.code}), restarting...`,
      )
      await sleep(CRASH_RESTART_DELAY_MS)
    }
  } catch (error) {
    console.error(formatCliStartupFailure('supervisor', error))
    process.exit(1)
  }
}
