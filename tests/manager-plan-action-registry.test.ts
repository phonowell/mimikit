import { execFileSync } from 'node:child_process'

import { describe, expect, test } from 'vitest'

describe('action-validation barrel exports load registry modules in tsx runtime', () => {
  test('plan and support action registries load', () => {
    expect(
      execFileSync(
        'pnpm',
        [
          'exec',
          'tsx',
          '--eval',
          `Promise.all([
            import('./src/policy/manager/action-registry-plan-definitions.ts'),
            import('./src/policy/manager/action-registry-support-definitions.ts'),
          ]).then(() => console.log('ok'))`,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      ),
    ).toContain('ok')
  }, 30_000)
})
