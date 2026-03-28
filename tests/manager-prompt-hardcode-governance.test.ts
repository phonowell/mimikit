import { existsSync, readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

const readWorkspaceFile = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')

test('manager validation and intent-evidence modules do not keep inline prompt-like Chinese literals', () => {
  const files = [
    'src/policy/manager/action-validation.ts',
    'src/policy/manager/action-validation-plan.ts',
    'src/policy/manager/action-validation-remember-memory.ts',
    'src/policy/manager/action-validation-remember-project-profile.ts',
    'src/policy/manager/action-intent-evidence-dialog-memory.ts',
    'src/policy/manager/task-contract.ts',
  ]

  for (const file of files) {
    const content = readWorkspaceFile(file)
    expect(content, file).not.toMatch(
      /['"`][^'"`\n]*[\u4e00-\u9fff][^'"`\n]*['"`]/u,
    )
  }
})

test('stale mutate_task git validator module is removed', () => {
  expect(
    existsSync(
      new URL(
        '../src/policy/manager/action-validation-mutate-task-git.ts',
        import.meta.url,
      ),
    ),
  ).toBe(false)
})
