import { resolve } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { applyCliEnvOverrides } from '../src/cli/env.js'

const ENV_KEYS = [
  'MIMIKIT_MODEL',
  'MIMIKIT_MANAGER_MODEL',
  'MIMIKIT_WORKER_MODEL',
  'MIMIKIT_REASONING_EFFORT',
  'MIMIKIT_MANAGER_REASONING_EFFORT',
  'MIMIKIT_WORKER_REASONING_EFFORT',
  'MIMIKIT_PROXY',
  'MIMIKIT_MANAGER_PROXY',
  'MIMIKIT_WORKER_PROXY',
  'MIMIKIT_WEBUI_ENABLED',
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

test('global model and reasoning apply to both manager and worker', () => {
  const config = createConfig()
  process.env.MIMIKIT_MODEL = 'gpt-test-global'
  process.env.MIMIKIT_REASONING_EFFORT = 'medium'

  applyCliEnvOverrides(config)

  expect(config.manager.model).toBe('gpt-test-global')
  expect(config.worker.model).toBe('gpt-test-global')
  expect(config.manager.modelReasoningEffort).toBe('medium')
  expect(config.worker.modelReasoningEffort).toBe('medium')
})

test('role-specific env overrides global env values', () => {
  const config = createConfig()
  process.env.MIMIKIT_MODEL = 'gpt-test-global'
  process.env.MIMIKIT_MANAGER_MODEL = 'gpt-test-manager'
  process.env.MIMIKIT_WORKER_MODEL = 'gpt-test-worker'
  process.env.MIMIKIT_REASONING_EFFORT = 'low'
  process.env.MIMIKIT_MANAGER_REASONING_EFFORT = 'high'
  process.env.MIMIKIT_WORKER_REASONING_EFFORT = 'minimal'

  applyCliEnvOverrides(config)

  expect(config.manager.model).toBe('gpt-test-manager')
  expect(config.worker.model).toBe('gpt-test-worker')
  expect(config.manager.modelReasoningEffort).toBe('high')
  expect(config.worker.modelReasoningEffort).toBe('minimal')
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
