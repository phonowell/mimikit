import { expect, test } from 'vitest'

import {
  dispatchFeishuPassiveReply,
  startFeishuPolling,
  stopFeishuPolling,
} from '../../src/channels/feishu/index.js'
import {
  dispatchTelegramPassiveReply,
  startTelegramPolling,
  stopTelegramPolling,
} from '../../src/channels/telegram/index.js'

test('channel exports are loadable', () => {
  expect(typeof startTelegramPolling).toBe('function')
  expect(typeof stopTelegramPolling).toBe('function')
  expect(typeof dispatchTelegramPassiveReply).toBe('function')
  expect(typeof startFeishuPolling).toBe('function')
  expect(typeof stopFeishuPolling).toBe('function')
  expect(typeof dispatchFeishuPassiveReply).toBe('function')
})
