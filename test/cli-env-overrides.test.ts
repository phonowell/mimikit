import { resolve } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { applyCliEnvOverrides } from '../src/cli/env.js'

const ENV_KEYS = [
  'MIMIKIT_MODEL',
  'MIMIKIT_MANAGER_MODEL',
  'MIMIKIT_CODEX_MODEL',
  'MIMIKIT_OPENCODE_MODEL',
  'MIMIKIT_REASONING_EFFORT',
  'MIMIKIT_MANAGER_REASONING_EFFORT',
  'MIMIKIT_CODEX_REASONING_EFFORT',
  'MIMIKIT_PROXY',
  'MIMIKIT_MANAGER_PROXY',
  'MIMIKIT_CODEX_PROXY',
  'MIMIKIT_OPENCODE_PROXY',
  'MIMIKIT_CODEX_ENABLED',
  'MIMIKIT_OPENCODE_ENABLED',
  'MIMIKIT_WEBUI_ENABLED',
  'MIMIKIT_WEBUI_PORT',
  'TELEGRAM_PROXY',
] as const

type Snapshot = Partial<Record<(typeof ENV_KEYS)[number], string>>

let snapshot: Snapshot = {}

beforeEach(() => {
  snapshot = {}
  for (const key of ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) snapshot[key] = value
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  for (const key of ENV_KEYS) {
    const value = snapshot[key]
    if (value !== undefined) process.env[key] = value
  }
})

const createConfig = () =>
  defaultConfig({
    workDir: resolve('/tmp/mimikit-cli-env-overrides'),
  })

test('global model and reasoning apply to manager and codex/opencode', () => {
  const config = createConfig()
  process.env.MIMIKIT_MODEL = 'gpt-test-global'
  process.env.MIMIKIT_REASONING_EFFORT = 'medium'

  applyCliEnvOverrides(config)

  expect(config.manager.model).toBe('gpt-test-global')
  expect(config.codex.model).toBe('gpt-test-global')
  expect(config.opencode.model).toBe('gpt-test-global')
  expect(config.manager.modelReasoningEffort).toBe('medium')
  expect(config.codex.modelReasoningEffort).toBe('medium')
})

test('role-specific env overrides global env values', () => {
  const config = createConfig()
  process.env.MIMIKIT_MODEL = 'gpt-test-global'
  process.env.MIMIKIT_MANAGER_MODEL = 'gpt-test-manager'
  process.env.MIMIKIT_CODEX_MODEL = 'gpt-test-codex'
  process.env.MIMIKIT_OPENCODE_MODEL = 'gpt-test-opencode'
  process.env.MIMIKIT_REASONING_EFFORT = 'low'
  process.env.MIMIKIT_MANAGER_REASONING_EFFORT = 'high'
  process.env.MIMIKIT_CODEX_REASONING_EFFORT = 'minimal'
  process.env.MIMIKIT_PROXY = 'http://127.0.0.1:7897'
  process.env.MIMIKIT_CODEX_PROXY = 'http://127.0.0.1:7898'
  process.env.MIMIKIT_OPENCODE_ENABLED = 'true'

  applyCliEnvOverrides(config)

  expect(config.manager.model).toBe('gpt-test-manager')
  expect(config.codex.model).toBe('gpt-test-codex')
  expect(config.opencode.model).toBe('gpt-test-opencode')
  expect(config.manager.modelReasoningEffort).toBe('high')
  expect(config.codex.modelReasoningEffort).toBe('minimal')
  expect(config.manager.proxy).toBe('http://127.0.0.1:7897')
  expect(config.codex.proxy).toBe('http://127.0.0.1:7898')
  expect(config.opencode.proxy).toBe('http://127.0.0.1:7897')
  expect(config.opencode.enabled).toBe(true)
})

test('telegram proxy env overrides config value', () => {
  const config = createConfig()
  process.env.TELEGRAM_PROXY = 'http://127.0.0.1:7897'

  applyCliEnvOverrides(config)

  expect(config.telegram.proxy).toBe('http://127.0.0.1:7897')
})

test('webui enabled env overrides config value', () => {
  const config = createConfig()
  process.env.MIMIKIT_WEBUI_ENABLED = 'false'

  applyCliEnvOverrides(config)

  expect(config.webui.enabled).toBe(false)
})

test('webui port env overrides config value', () => {
  const config = createConfig()
  process.env.MIMIKIT_WEBUI_PORT = '9797'

  applyCliEnvOverrides(config)

  expect(config.webui.port).toBe(9797)
})
