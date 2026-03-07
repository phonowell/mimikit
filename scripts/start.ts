import { spawnSync } from 'node:child_process'
import type { SpawnSyncOptions } from 'node:child_process'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const forwardedArgs = process.argv.slice(2)
const args =
  forwardedArgs.length > 0 && forwardedArgs[0] === '--'
    ? forwardedArgs.slice(1)
    : forwardedArgs

const runCommand = (
  command: string,
  commandArgs: string[],
  options: SpawnSyncOptions = {},
): number => {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    ...options,
  })

  if (result.error) {
    const message =
      result.error instanceof Error ? result.error.message : String(result.error)
    console.error(`[mimikit] failed to run ${command}: ${message}`)
    return 1
  }

  return result.status ?? 1
}

// `pnpm start` must ensure dependencies before launching the CLI entrypoint.
// Keep this block ahead of every runtime launch branch.
const installExitCode =
  process.platform === 'win32'
    ? runCommand('cmd.exe', ['/d', '/s', '/c', 'pnpm i'], { cwd: rootDir })
    : runCommand('pnpm', ['i'], { cwd: rootDir })

if (installExitCode !== 0) {
  process.exit(installExitCode)
}

if (process.platform === 'win32') {
  const windowsScript = join(rootDir, 'bin', 'mimikit.cmd')
  const exitCode = runCommand(
    'cmd.exe',
    ['/d', '/s', '/c', windowsScript, ...args],
    { cwd: rootDir },
  )
  process.exit(exitCode)
}

const unixScript = join(rootDir, 'bin', 'mimikit')
if (process.platform === 'darwin') {
  const exitCode = runCommand(
    'caffeinate',
    ['-dimsu', 'bash', unixScript, ...args],
    { cwd: rootDir },
  )
  process.exit(exitCode)
}

const exitCode = runCommand('bash', [unixScript, ...args], { cwd: rootDir })
process.exit(exitCode)
