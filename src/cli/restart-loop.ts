import { spawn } from 'node:child_process'

import { waitForPortRelease } from './port.js'

const RESTART_CHILD_ENV = 'MIMIKIT_CLI_RESPAWN_CHILD'

export const STARTED_BY_RESPAWN_CHILD = process.env[RESTART_CHILD_ENV] === '1'

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

const buildRespawnArgs = (port: number | null): string[] => {
  const cliArgs = process.argv.slice(1)
  return port === null
    ? [...process.execArgv, ...cliArgs]
    : [...process.execArgv, ...stripPortArgs(cliArgs), '--port', String(port)]
}

export const runFreshProcessRestartLoop = async (
  port: number | null,
): Promise<never> => {
  const childArgs = buildRespawnArgs(port)
  let activeChild: ReturnType<typeof spawn> | null = null
  const forwardSignal = (signal: NodeJS.Signals): void => {
    if (activeChild?.exitCode !== null) return
    activeChild.kill(signal)
  }

  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))

  for (;;) {
    activeChild = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        [RESTART_CHILD_ENV]: '1',
      },
    })

    const exitCode = await new Promise<number>((resolve, reject) => {
      activeChild?.once('error', reject)
      activeChild?.once('exit', (code, signal) => {
        if (typeof code === 'number') {
          resolve(code)
          return
        }
        if (signal) {
          resolve(128)
          return
        }
        resolve(1)
      })
    })
    activeChild = null

    if (exitCode !== 75) process.exit(exitCode)
    if (port !== null) await waitForPortRelease(port)
    console.log('[cli] restarting...')
  }
}
