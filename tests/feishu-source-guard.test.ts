import { expect, test } from 'vitest'

import {
  hasNoChoiceReturnChannelInput,
  isNoChoiceReturnChannelSource,
} from '../src/channels/feishu/source.js'

test('isNoChoiceReturnChannelSource supports telegram and feishu', () => {
  expect(isNoChoiceReturnChannelSource('telegram')).toBe(true)
  expect(isNoChoiceReturnChannelSource('feishu')).toBe(true)
  expect(isNoChoiceReturnChannelSource('webui')).toBe(false)
})

test('hasNoChoiceReturnChannelInput detects telegram and feishu messages', () => {
  expect(
    hasNoChoiceReturnChannelInput([
      {
        id: 'input-telegram-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'telegram',
        telegramChatId: '1001',
      },
    ]),
  ).toBe(true)

  expect(
    hasNoChoiceReturnChannelInput([
      {
        id: 'input-feishu-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'feishu',
        feishuChatId: 'oc_test_chat',
      },
    ]),
  ).toBe(true)

  expect(
    hasNoChoiceReturnChannelInput([
      {
        id: 'input-webui-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'webui',
      },
    ]),
  ).toBe(false)
})
