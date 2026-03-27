import { expect, test } from 'vitest'

import { loadDefaultConfigFromToml } from '../../src/bootstrap/config-default-loader.js'

import { writeTempConfig } from './testkit.js'

test('fills defaults when optional fields are omitted', async () => {
  const path = await writeTempConfig('[manager]\nmodel = "gpt-5"\n')

  const config = loadDefaultConfigFromToml(path)

  expect(config.manager.model).toBe('gpt-5')
  expect(config.manager.modelReasoningEffort).toBe('medium')
  expect(config.codex.model).toBe('gpt-5.4')
  expect(config.codex.enabled).toBe(true)
  expect(config.codex.modelReasoningEffort).toBe('high')
  expect(config.worker.timeoutMs).toBe(600000)
  expect(config.codex.proxy).toBeUndefined()
  expect(config.webui.enabled).toBe(true)
  expect(config.webui.port).toBe(8787)
  expect(config.telegram.enabled).toBe(false)
  expect(config.telegram.proxy).toBe('')
  expect(Object.keys(config).sort()).toEqual([
    'codex',
    'manager',
    'telegram',
    'webui',
    'worker',
  ])
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
    ['[manager]', 'baseUrl = ""', 'apiKey = "   "', 'proxy = "   "', ''].join(
      '\n',
    ),
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
    ].join('\n'),
  )

  const config = loadDefaultConfigFromToml(path)

  expect(config.manager.proxy).toBe('http://127.0.0.1:7897')
  expect(config.codex.proxy).toBe('http://127.0.0.1:7898')
})
