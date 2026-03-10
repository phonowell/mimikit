import { afterEach, expect, test } from 'vitest'

import {
  applyFeishuEnvOverrides,
  assertEnabledFeishuConfig,
  type FeishuConfig,
} from '../../src/channels/feishu/config.js'

const ENV_KEYS = [
  'FEISHU_CHANNEL_ENABLED',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_CHAT_ID',
] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

const createConfig = (): FeishuConfig => ({
  enabled: false,
  appId: '',
  appSecret: '',
  chatId: '',
})

test('applyFeishuEnvOverrides updates config fields', () => {
  const config = createConfig()
  process.env.FEISHU_CHANNEL_ENABLED = 'true'
  process.env.FEISHU_APP_ID = 'app-id'
  process.env.FEISHU_APP_SECRET = 'app-secret'
  process.env.FEISHU_CHAT_ID = 'oc_chat_id'

  applyFeishuEnvOverrides(config)

  expect(config.enabled).toBe(true)
  expect(config.appId).toBe('app-id')
  expect(config.appSecret).toBe('app-secret')
  expect(config.chatId).toBe('oc_chat_id')
})

test('assertEnabledFeishuConfig requires app credentials', () => {
  const config = createConfig()
  expect(() => assertEnabledFeishuConfig(config)).toThrow(
    'requires feishu.appId and feishu.appSecret',
  )
})

test('assertEnabledFeishuConfig validates chatId prefix when present', () => {
  const config: FeishuConfig = {
    enabled: true,
    appId: 'app-id',
    appSecret: 'app-secret',
    chatId: 'chat-id-without-prefix',
  }

  expect(() => assertEnabledFeishuConfig(config)).toThrow(
    'feishu.chatId must start with "oc_"',
  )
})
