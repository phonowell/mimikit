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

const main = (): void => {
  // `start` must ensure dependencies before launching the CLI entrypoint.
  // Keep this block ahead of every runtime launch branch.
  const bootstrapExitCode =
    process.platform === 'win32'
      ? runCommand('cmd.exe', ['/d', '/s', '/c', 'node scripts/bootstrap.mjs'], {
          cwd: rootDir,
        })
      : runCommand('node', ['scripts/bootstrap.mjs'], { cwd: rootDir })

  if (bootstrapExitCode !== 0) {
    process.exit(bootstrapExitCode)
  }

  const installExitCode =
    process.platform === 'win32'
      ? runCommand('cmd.exe', ['/d', '/s', '/c', 'pnpm install'], { cwd: rootDir })
      : runCommand('pnpm', ['install'], { cwd: rootDir })

  if (installExitCode !== 0) {
    process.exit(installExitCode)
  }

  const launcher = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const directArgs = [
    'exec',
    'tsx',
    join(rootDir, 'src', 'bootstrap', 'cli', 'index.ts'),
    ...args,
  ]
  const exitCode =
    process.platform === 'darwin'
      ? runCommand('caffeinate', ['-ism', launcher, ...directArgs], {
          cwd: rootDir,
        })
      : runCommand(launcher, directArgs, { cwd: rootDir })
  process.exit(exitCode)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
