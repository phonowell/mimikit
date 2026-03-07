import { expect, test } from 'vitest'

import { assertRequiredChannelFields } from '../src/channels/shared/channel-config.js'

test('assertRequiredChannelFields passes when all values are present', () => {
  expect(() =>
    assertRequiredChannelFields({
      channel: 'telegram',
      fields: [
        { key: 'botToken', value: 'token' },
        { key: 'chatId', value: '1001' },
      ],
    }),
  ).not.toThrow()
})

test('assertRequiredChannelFields reports missing field keys', () => {
  expect(() =>
    assertRequiredChannelFields({
      channel: 'feishu',
      fields: [
        { key: 'appId', value: ' ' },
        { key: 'appSecret', value: '' },
      ],
    }),
  ).toThrow('[config] feishu.enabled=true requires feishu.appId and feishu.appSecret')
})

test('assertRequiredChannelFields supports custom message keys for compatibility', () => {
  expect(() =>
    assertRequiredChannelFields({
      channel: 'telegram',
      fields: [{ key: 'botToken', value: '' }],
      messageKeys: ['botToken', 'chatId'],
    }),
  ).toThrow('[config] telegram.enabled=true requires telegram.botToken and telegram.chatId')
})
