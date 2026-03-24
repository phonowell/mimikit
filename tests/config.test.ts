import { expect, test, vi } from 'vitest'

vi.mock('../src/bootstrap/config-default-loader.js', () => ({
  loadDefaultConfigFromToml: () => ({
    manager: {
      model: 'gpt-test-manager',
      modelReasoningEffort: 'medium',
      maxCorrectionRounds: 9,
    },
    worker: {
      maxConcurrent: 2,
      timeoutMs: 321000,
      budget: {
        maxDurationMs: 654000,
        maxRounds: 7,
      },
    },
    codex: {
      enabled: true,
      model: 'gpt-test-codex',
      modelReasoningEffort: 'high',
      capability: 'high',
      billing: 'medium',
    },
    webui: {
      enabled: true,
      port: 8787,
    },
    telegram: {
      enabled: false,
      botToken: '',
      chatId: '',
      apiRoot: 'https://api.telegram.org',
      proxy: '',
    },
    feishu: {
      enabled: false,
      appId: '',
      appSecret: '',
      chatId: '',
    },
  }),
}))

import { defaultConfig } from '../src/bootstrap/config.js'

test('defaultConfig keeps worker budget overrides from user config', () => {
  const config = defaultConfig({ workDir: '.mimikit' })

  expect(config.worker.timeoutMs).toBe(321000)
  expect(config.worker.budget).toEqual({
    maxDurationMs: 654000,
    maxRounds: 7,
  })
})

test('defaultConfig keeps manager correction round override from user config', () => {
  const config = defaultConfig({ workDir: '.mimikit' })

  expect(config.manager.maxCorrectionRounds).toBe(9)
})

test('defaultConfig returns independent nested defaults per call', () => {
  const first = defaultConfig({ workDir: '.mimikit-a' })
  first.worker.retry.maxAttempts = 9
  first.worker.retry.backoffMs = 1
  first.manager.promptSections.tasksMaxBytes = 123
  first.manager.taskCreate.debounceMs = 99
  first.manager.taskWindow.maxCount = 1
  first.manager.planWindow.minCount = 99

  const second = defaultConfig({ workDir: '.mimikit-b' })

  expect(second.worker.retry).toEqual({
    maxAttempts: 1,
    backoffMs: 5000,
  })
  expect(second.manager.promptSections.tasksMaxBytes).toBe(24576)
  expect(second.manager.taskCreate.debounceMs).toBe(4000)
  expect(second.manager.taskWindow).toEqual({
    maxCount: 20,
    minCount: 5,
  })
  expect(second.manager.planWindow).toEqual({
    maxCount: 20,
    minCount: 5,
  })
})
