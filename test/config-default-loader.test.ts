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
  expect(config.manager.modelReasoningEffort).toBe('high')
  expect(config.worker.model).toBe('gpt-5.3-codex-high')
  expect(config.worker.timeoutMs).toBe(600000)
  expect(config.qq.enabled).toBe(false)
})

test('normalizes empty provider overrides to undefined', async () => {
  const path = await writeTempConfig(
    [
      'manager:',
      '  provider:',
      '    baseUrl: ""',
      '    apiKey: "   "',
    ].join('\n'),
  )

  const config = loadDefaultConfigFromYaml(path)

  expect(config.manager.provider).toEqual({})
})

test('rejects removed legacy fields without compatibility layer', async () => {
  const path = await writeTempConfig(
    [
      'manager:',
      '  model: gpt-5.2-high',
      '  maxCorrectionRounds: 3',
    ].join('\n'),
  )

  expect(() => loadDefaultConfigFromYaml(path)).toThrow(
    /invalid yaml defaults: manager: Unrecognized key: "maxCorrectionRounds"/,
  )
})
