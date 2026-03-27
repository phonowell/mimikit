import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const tsxCliPath = resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs')

const importWithTsx = (specifier: string): string =>
  execFileSync(
    process.execPath,
    [
      tsxCliPath,
      '--eval',
      `import('${specifier}').then(() => console.log('ok'))`,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  )

describe('action-validation barrel exports load registry modules in tsx runtime', () => {
  test('plan action registry loads', () => {
    expect(
      importWithTsx('./src/policy/manager/action-registry-plan-definitions.ts'),
    ).toContain('ok')
  })

  test('support action registry loads', () => {
    expect(
      importWithTsx(
        './src/policy/manager/action-registry-support-definitions.ts',
      ),
    ).toContain('ok')
  })
})
