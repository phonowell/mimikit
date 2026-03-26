import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { shouldBuildWebUiGenerated } from '../src/surface/http/webui-build.js'

const createTmpRoot = () =>
  mkdtemp(join(tmpdir(), 'mimikit-webui-build-readiness-'))

const touch = async (path: string, timeMs: number): Promise<void> => {
  const date = new Date(timeMs)
  await utimes(path, date, date)
}

const writeTimedFile = async (
  path: string,
  contents: string,
  timeMs: number,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, 'utf8')
  await touch(path, timeMs)
}

const setupWebUiBuildFixture = async (params: {
  generatedAt: number
  sourceAt: number
  omitGeneratedApp?: boolean
}) => {
  const rootDir = await createTmpRoot()
  const generatedDir = join(rootDir, 'webui', 'generated')
  const webuiSourceDir = join(rootDir, 'webui-src')
  const buildScriptPath = join(rootDir, 'scripts', 'build-webui.mjs')
  const tsconfigPath = join(rootDir, 'tsconfig.webui.json')

  await mkdir(join(generatedDir, 'chunks'), { recursive: true })
  await touch(join(generatedDir, 'chunks'), params.generatedAt)
  if (!params.omitGeneratedApp) {
    await writeTimedFile(
      join(generatedDir, 'app.js'),
      'export {}',
      params.generatedAt,
    )
  }
  await writeTimedFile(
    join(generatedDir, 'archive-viewer.js'),
    'export {}',
    params.generatedAt,
  )
  await writeTimedFile(
    join(generatedDir, 'chunks', 'chunk-A.js'),
    'export {}',
    params.generatedAt,
  )
  await writeTimedFile(
    join(webuiSourceDir, 'main.tsx'),
    'export {}',
    params.sourceAt,
  )
  await writeTimedFile(buildScriptPath, 'export {}', params.sourceAt)
  await writeTimedFile(tsconfigPath, '{}', params.sourceAt)

  return {
    buildScriptPath,
    generatedDir,
    tsconfigPath,
    webuiSourceDir,
  }
}

describe('shouldBuildWebUiGenerated', () => {
  test('skips rebuild when generated assets are newer than sources', async () => {
    const paths = await setupWebUiBuildFixture({
      generatedAt: Date.UTC(2026, 2, 25, 11, 0, 0),
      sourceAt: Date.UTC(2026, 2, 25, 10, 0, 0),
    })

    await expect(shouldBuildWebUiGenerated(paths)).resolves.toBe(false)
  })

  test('rebuilds when sources are newer than generated assets', async () => {
    const paths = await setupWebUiBuildFixture({
      generatedAt: Date.UTC(2026, 2, 25, 10, 0, 0),
      sourceAt: Date.UTC(2026, 2, 25, 11, 0, 0),
    })

    await expect(shouldBuildWebUiGenerated(paths)).resolves.toBe(true)
  })

  test('rebuilds when required generated entrypoints are missing', async () => {
    const paths = await setupWebUiBuildFixture({
      generatedAt: Date.UTC(2026, 2, 25, 11, 0, 0),
      sourceAt: Date.UTC(2026, 2, 25, 10, 0, 0),
      omitGeneratedApp: true,
    })

    await expect(shouldBuildWebUiGenerated(paths)).resolves.toBe(true)
  })
})
