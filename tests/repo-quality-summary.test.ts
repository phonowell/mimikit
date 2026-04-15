import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { collectRepoQualitySnapshot } from '../src/foundation/repo-health/summary.js'
import { formatRepoQualitySummary } from '../webui-src/lib/repo-quality.js'

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

test('formatRepoQualitySummary highlights source budget overage', () => {
  expect(
    formatRepoQualitySummary({
      generatedAt: '2026-04-15T00:00:00.000Z',
      sourceFileCount: 10,
      sourceLineCount: 32574,
      sourceLineTarget: 20000,
      sourceLineOverage: 12574,
      maxSourceFileLines: 198,
      webUiFileCount: 20,
      webUiLineCount: 5200,
      testFileCount: 30,
      testLineCount: 23313,
      promptFileCount: 12,
    }),
  ).toContain('+12.6k over target')
})
