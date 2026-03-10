import { expect, test, vi } from 'vitest'

vi.mock('../src/config-default-loader.js', () => ({
  loadDefaultConfigFromToml: () => ({
    manager: {
      model: 'gpt-test-manager',
      modelReasoningEffort: 'medium',
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
    opencode: {
      enabled: false,
      model: 'big-pickle',
      capability: 'low',
      billing: 'free',
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

import { defaultConfig } from '../src/config.js'

test('defaultConfig keeps worker budget overrides from user config', () => {
  const config = defaultConfig({ workDir: '.mimikit' })

  expect(config.worker.timeoutMs).toBe(321000)
  expect(config.worker.budget).toEqual({
    maxDurationMs: 654000,
    maxRounds: 7,
  })
})
