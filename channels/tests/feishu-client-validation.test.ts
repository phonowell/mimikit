import { expect, test } from 'vitest'

import { sendFeishuTextMessage } from '../src/channels/feishu/client.js'

test('sendFeishuTextMessage validates required fields before network call', async () => {
  await expect(
    sendFeishuTextMessage({
      appId: '',
      appSecret: '',
      chatId: '',
      text: '',
    }),
  ).rejects.toThrow('missing_app_id')
})
