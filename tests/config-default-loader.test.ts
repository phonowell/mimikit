import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { loadDefaultConfigFromToml } from '../src/config-default-loader.js'

const tempDirs: string[] = []

const writeTempConfig = async (source: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-config-loader-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.toml')
  await writeFile(path, source, 'utf8')
  return path
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

test('fills defaults when optional fields are omitted', async () => {
  const path = await writeTempConfig('[manager]\nmodel = "gpt-5"\n')

  const config = loadDefaultConfigFromToml(path)

  expect(config.manager.model).toBe('gpt-5')
  expect(config.manager.modelReasoningEffort).toBe('medium')
  expect(config.codex.model).toBe('gpt-5.4')
  expect(config.codex.enabled).toBe(true)
  expect(config.codex.modelReasoningEffort).toBe('high')
  expect(config.opencode.enabled).toBe(false)
  expect(config.opencode.model).toBe('big-pickle')
  expect(config.worker.timeoutMs).toBe(600000)
  expect(config.codex.proxy).toBeUndefined()
  expect(config.opencode.proxy).toBeUndefined()
  expect(config.webui.enabled).toBe(true)
  expect(config.webui.port).toBe(8787)
  expect(config.telegram.enabled).toBe(false)
  expect(config.telegram.proxy).toBe('')
  expect(config.feishu.enabled).toBe(false)
  expect(config.feishu.appId).toBe('')
  expect(config.feishu.appSecret).toBe('')
  expect(config.feishu.chatId).toBe('')
})

test('supports explicit webui enabled switch', async () => {
  const path = await writeTempConfig('[webui]\nenabled = false\n')

  const config = loadDefaultConfigFromToml(path)

  expect(config.webui.enabled).toBe(false)
})

test('supports explicit webui port switch', async () => {
  const path = await writeTempConfig('[webui]\nport = 9797\n')

  const config = loadDefaultConfigFromToml(path)

  expect(config.webui.port).toBe(9797)
})

test('normalizes empty provider overrides to undefined', async () => {
  const path = await writeTempConfig(
    [
      '[manager]',
      'baseUrl = ""',
      'apiKey = "   "',
      'proxy = "   "',
      '',
    ].join('\n'),
  )

  const config = loadDefaultConfigFromToml(path)

  expect(config.manager.baseUrl).toBeUndefined()
  expect(config.manager.apiKey).toBeUndefined()
  expect(config.manager.proxy).toBeUndefined()
})

test('supports manager and provider proxy overrides', async () => {
  const path = await writeTempConfig(
    [
      '[manager]',
      'proxy = " http://127.0.0.1:7897 "',
      '',
      '[codex]',
      'proxy = " http://127.0.0.1:7898 "',
      '',
      '[opencode]',
      'proxy = " http://127.0.0.1:7899 "',
      '',
    ].join('\n'),
  )

  const config = loadDefaultConfigFromToml(path)

  expect(config.manager.proxy).toBe('http://127.0.0.1:7897')
  expect(config.codex.proxy).toBe('http://127.0.0.1:7898')
  expect(config.opencode.proxy).toBe('http://127.0.0.1:7899')
})

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
  expect(config.codex.model).toBe('gpt-5.4')
  expect(unknownKeys).toEqual([
    'manager.maxCorrectionRounds',
    'manager.promptSections',
    'worker.retry',
  ])
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

  expect(unknownKeys).toEqual([
    'manager.maxCorrectionRounds',
    'manager.promptSections',
    'worker.retry',
  ])
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
    [
      'qq = true',
      '',
      '[manager]',
      'model = 123',
      '',
    ].join('\n'),
  )

  expect(() => loadDefaultConfigFromToml(path)).toThrow(/manager.model/)
})

test('missing config path falls back to template without creating file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-config-loader-missing-'))
  tempDirs.push(dir)
  const missingPath = join(dir, 'config.toml')

  const config = loadDefaultConfigFromToml(missingPath)

  expect(config.manager.model).toBe('gpt-5.2')
  expect(config.webui.port).toBe(8787)
  await expect(readFile(missingPath)).rejects.toMatchObject({ code: 'ENOENT' })
})
