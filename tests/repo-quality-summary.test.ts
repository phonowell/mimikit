import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { collectRepoQualitySnapshot } from '../src/foundation/repo-health/summary.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-repo-quality-'))

test('collectRepoQualitySnapshot counts source, webui, tests and prompts separately', async () => {
  const repoRoot = await createTmpDir()
  await Promise.all([
    mkdir(join(repoRoot, 'src', 'feature'), { recursive: true }),
    mkdir(join(repoRoot, 'webui-src'), { recursive: true }),
    mkdir(join(repoRoot, 'tests'), { recursive: true }),
    mkdir(join(repoRoot, 'prompts', 'manager'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(
      join(repoRoot, 'src', 'feature', 'a.ts'),
      'const a = 1\n',
      'utf8',
    ),
    writeFile(
      join(repoRoot, 'webui-src', 'panel.tsx'),
      'export const Panel = () => null\n',
      'utf8',
    ),
    writeFile(
      join(repoRoot, 'tests', 'a.test.ts'),
      'test("a", () => {})\n',
      'utf8',
    ),
    writeFile(
      join(repoRoot, 'prompts', 'manager', 'action.md'),
      '# prompt\n',
      'utf8',
    ),
  ])

  const snapshot = await collectRepoQualitySnapshot(repoRoot)

  expect(snapshot.sourceFileCount).toBe(1)
  expect(snapshot.webUiFileCount).toBe(1)
  expect(snapshot.testFileCount).toBe(1)
  expect(snapshot.promptFileCount).toBe(1)
  expect(snapshot.sourceLineCount).toBeGreaterThan(0)
  expect(snapshot.maxSourceFileLines).toBe(snapshot.sourceLineCount)
})
