import { spawnSync } from 'node:child_process'
import type { SpawnSyncOptions } from 'node:child_process'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)

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

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const installExitCode = runCommand(pnpmCommand, ['i'], { cwd: rootDir })
if (installExitCode !== 0) {
  process.exit(installExitCode)
}

if (process.platform === 'win32') {
  const windowsScript = join(rootDir, 'bin', 'mimikit.ps1')
  const exitCode = runCommand(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', windowsScript, ...args],
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
