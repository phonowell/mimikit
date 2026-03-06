import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { loadDefaultConfigFromYaml } from '../src/config-default-loader.js'

const tempDirs: string[] = []

const writeTempConfig = async (source: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-config-loader-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.yaml')
  await writeFile(path, source, 'utf8')
  return path
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

test('fills defaults when optional fields are omitted', async () => {
  const path = await writeTempConfig('manager:\n  model: gpt-5\n')

  const config = loadDefaultConfigFromYaml(path)

  expect(config.manager.model).toBe('gpt-5')
  expect(config.manager.modelReasoningEffort).toBe('medium')
  expect(config.worker.model).toBe('gpt-5.3-codex')
  expect(config.worker.timeoutMs).toBe(600000)
  expect(config.worker.proxy).toBeUndefined()
  expect(config.webui.enabled).toBe(true)
  expect(config.telegram.enabled).toBe(false)
  expect(config.telegram.proxy).toBe('')
})

test('supports explicit webui enabled switch', async () => {
  const path = await writeTempConfig('webui:\n  enabled: false\n')

  const config = loadDefaultConfigFromYaml(path)

  expect(config.webui.enabled).toBe(false)
})

test('normalizes empty provider overrides to undefined', async () => {
  const path = await writeTempConfig(
    [
      'manager:',
      '  provider:',
      '    baseUrl: ""',
      '    apiKey: "   "',
      '    proxy: "   "',
    ].join('\n'),
  )

  const config = loadDefaultConfigFromYaml(path)

  expect(config.manager.provider).toEqual({})
})

test('supports manager and worker proxy overrides', async () => {
  const path = await writeTempConfig(
    [
      'manager:',
      '  provider:',
      '    proxy: " http://127.0.0.1:7897 "',
      'worker:',
      '  proxy: " http://127.0.0.1:7898 "',
    ].join('\n'),
  )

  const config = loadDefaultConfigFromYaml(path)

  expect(config.manager.provider.proxy).toBe('http://127.0.0.1:7897')
  expect(config.worker.proxy).toBe('http://127.0.0.1:7898')
})

test('supports provider model fallback and ignores runtime-only compatibility keys', async () => {
  const path = await writeTempConfig(
    [
      'manager:',
      '  provider:',
      '    model: gpt-5.2-mini',
      '    modelReasoningEffort: medium',
      '  maxCorrectionRounds: 3',
      '  promptSections:',
      '    tasksMaxBytes: 1024',
      'worker:',
      '  retry:',
      '    maxAttempts: 2',
      '    backoffMs: 1000',
    ].join('\n'),
  )

  const config = loadDefaultConfigFromYaml(path)

  expect(config.manager.model).toBe('gpt-5.2-mini')
  expect(config.manager.modelReasoningEffort).toBe('medium')
  expect(config.worker.model).toBe('gpt-5.3-codex')
})

test('ignores unknown keys and reports them via callback', async () => {
  const path = await writeTempConfig(
    [
      'qq: true',
      'manager:',
      '  model: gpt-5.2',
      '  unknownManagerKey: true',
    ].join('\n'),
  )

  let unknownKeys: string[] = []
  const config = loadDefaultConfigFromYaml(path, {
    onUnknownKeys: (keys) => {
      unknownKeys = [...keys]
    },
  })

  expect(config.manager.model).toBe('gpt-5.2')
  expect(unknownKeys).toEqual(['manager.unknownManagerKey', 'qq'])
})

test('still rejects invalid known fields when unknown keys are present', async () => {
  const path = await writeTempConfig(
    [
      'qq: true',
      'manager:',
      '  model: 123',
    ].join('\n'),
  )

  expect(() => loadDefaultConfigFromYaml(path)).toThrow(/manager.model/)
})
