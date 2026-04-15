import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { loadDefaultConfigFromToml } from '../../src/bootstrap/config-default-loader.js'

import { writeTempConfig } from './testkit.js'

test('supports manager model overrides and ignores unknown keys after reporting them', async () => {
  const path = await writeTempConfig(
    [
      '[manager]',
      'maxCorrectionRounds = 3',
      'model = "gpt-5.2-mini"',
      'modelReasoningEffort = "medium"',
      '',
      '[manager.promptSections]',
      'tasksMaxBytes = 1024',
      '',
      '[worker.retry]',
      'maxAttempts = 2',
      'backoffMs = 1000',
      '',
    ].join('\n'),
  )

  let unknownKeys: string[] = []
  const config = loadDefaultConfigFromToml(path, {
    onUnknownKeys: (keys) => {
      unknownKeys = [...keys]
    },
  })

  expect(config.manager.model).toBe('gpt-5.2-mini')
  expect(config.manager.modelReasoningEffort).toBe('medium')
  expect(config.manager.maxCorrectionRounds).toBe(3)
  expect(config.codex.model).toBe('gpt-5.4')
  expect(unknownKeys).toEqual(['manager.promptSections', 'worker.retry'])
})

test('reports removed runtime-only keys as unknown', async () => {
  const path = await writeTempConfig(
    [
      '[manager]',
      'model = "gpt-5.2-mini"',
      'maxCorrectionRounds = 3',
      '',
      '[manager.promptSections]',
      'tasksMaxBytes = 1024',
      '',
      '[worker.retry]',
      'maxAttempts = 2',
      'backoffMs = 1000',
      '',
    ].join('\n'),
  )

  let unknownKeys: string[] = []
  loadDefaultConfigFromToml(path, {
    onUnknownKeys: (keys) => {
      unknownKeys = [...keys]
    },
  })

  expect(unknownKeys).toEqual(['manager.promptSections', 'worker.retry'])
})

test('ignores unknown keys and reports them via callback', async () => {
  const path = await writeTempConfig(
    [
      'qq = true',
      '',
      '[manager]',
      'model = "gpt-5.2"',
      'unknownManagerKey = true',
      '',
    ].join('\n'),
  )

  let unknownKeys: string[] = []
  const config = loadDefaultConfigFromToml(path, {
    onUnknownKeys: (keys) => {
      unknownKeys = [...keys]
    },
  })

  expect(config.manager.model).toBe('gpt-5.2')
  expect(unknownKeys).toEqual(['manager.unknownManagerKey', 'qq'])
})

test('still rejects invalid known fields when unknown keys are present', async () => {
  const path = await writeTempConfig(
    ['qq = true', '', '[manager]', 'model = 123', ''].join('\n'),
  )

  expect(() => loadDefaultConfigFromToml(path)).toThrow(/manager.model/)
})

test('missing config path falls back to template without creating file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-config-loader-missing-'))
  const missingPath = join(dir, 'config.toml')

  const config = loadDefaultConfigFromToml(missingPath)

  expect(config.manager.model).toBe('gpt-5.4')
  expect(config.manager.modelReasoningEffort).toBe('high')
  expect(config.webui.port).toBe(8787)
  await expect(readFile(missingPath)).rejects.toMatchObject({ code: 'ENOENT' })
})
