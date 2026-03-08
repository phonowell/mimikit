import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const START_SCRIPT_PATH = resolve(ROOT_DIR, 'scripts/start.ts')

test('pnpm start script keeps dependency install guard before runtime launch', () => {
  const source = readFileSync(START_SCRIPT_PATH, 'utf8')

  expect(source).toContain("runCommand('pnpm', ['install']")
  expect(source).toContain("const windowsScript = join(rootDir, 'bin', 'mimikit.cmd')")
  expect(source).toContain("forwardedArgs.length > 0 && forwardedArgs[0] === '--'")
  expect(source).toContain('forwardedArgs.slice(1)')

  const installIndex = source.indexOf('const installExitCode')
  const installGuardIndex = source.indexOf('if (installExitCode !== 0)')
  const runtimeLaunchIndex = source.indexOf("if (process.platform === 'win32')")

  expect(installIndex).toBeGreaterThanOrEqual(0)
  expect(installGuardIndex).toBeGreaterThan(installIndex)
  expect(runtimeLaunchIndex).toBeGreaterThan(installGuardIndex)
})
