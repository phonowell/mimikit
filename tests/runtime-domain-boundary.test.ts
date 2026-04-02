import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

const srcRoot = resolve(process.cwd(), 'src')

const readSource = (pathFromSrcRoot: string): string =>
  readFileSync(resolve(srcRoot, pathFromSrcRoot), 'utf8')

const KEY_MANAGER_AND_FOCUS_FILES = [
  'policy/manager/action-apply-plan.ts',
  'policy/manager/plan-progress.ts',
  'work/focus/state.ts',
  'work/focus/assign.ts',
  'work/focus/capacity.ts',
]

test('key manager and focus modules no longer use root-level runtime state fields', () => {
  const violations = KEY_MANAGER_AND_FOCUS_FILES.flatMap((pathFromSrcRoot) => {
    const content = readSource(pathFromSrcRoot)
    const matches = content.match(
      /runtime\.(tasks|taskPlans|focuses|queues|session|manager|worker|ui)\b/g,
    )
    return (matches ?? []).map((match) => `${pathFromSrcRoot}: ${match}`)
  })

  expect(violations).toEqual([])
})

test('key manager and focus modules do not directly mutate runtime domain collections', () => {
  const violations = KEY_MANAGER_AND_FOCUS_FILES.flatMap((pathFromSrcRoot) => {
    const content = readSource(pathFromSrcRoot)
    const matches = [
      ...content.matchAll(
        /runtime\.domain\.(tasks|taskPlans|focuses)\.(push|splice|sort)\b/g,
      ),
      ...content.matchAll(/runtime\.domain\.(tasks|taskPlans|focuses)\s*=\s*/g),
    ]
    return matches.map((match) => `${pathFromSrcRoot}: ${match[0]}`)
  })

  expect(violations).toEqual([])
})
