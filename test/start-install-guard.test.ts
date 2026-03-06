import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('start script dependency guard', () => {
  it('keeps install step before launching runtime entrypoints', () => {
    const startScript = readFileSync(resolve(process.cwd(), 'scripts/start.ts'), 'utf8')

    const installBlock = /const installExitCode[\s\S]*runCommand\('cmd\.exe', \['\/d', '\/s', '\/c', 'pnpm i'\][\s\S]*runCommand\('pnpm', \['i'\]/m
    expect(startScript).toMatch(installBlock)

    const installGuardIndex = startScript.indexOf('if (installExitCode !== 0)')
    const firstLaunchBranchIndex = startScript.indexOf('if (process.platform === \'win32\')')

    expect(installGuardIndex).toBeGreaterThan(-1)
    expect(firstLaunchBranchIndex).toBeGreaterThan(-1)
    expect(installGuardIndex).toBeLessThan(firstLaunchBranchIndex)
  })
})
