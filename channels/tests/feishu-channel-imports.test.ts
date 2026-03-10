import { expect, test } from 'vitest'

import {
  dispatchFeishuPassiveReply,
  hasFeishuUserInput,
  startFeishuPolling,
  stopFeishuPolling,
} from '../src/channels/feishu/index.js'

test('feishu channel index exports expected APIs', () => {
  expect(typeof startFeishuPolling).toBe('function')
  expect(typeof stopFeishuPolling).toBe('function')
  expect(typeof dispatchFeishuPassiveReply).toBe('function')
  expect(typeof hasFeishuUserInput).toBe('function')
})
