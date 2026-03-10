import { expect, test } from 'vitest'

import { defaultConfig } from '../../src/config.js'
import { startFeishuPolling } from '../../src/channels/feishu/polling.js'

test('startFeishuPolling validates required config when enabled', async () => {
  const config = defaultConfig({ workDir: '.mimikit-test-feishu-config' })
  config.feishu.enabled = true
  config.feishu.appId = ''
  config.feishu.appSecret = ''

  await expect(
    startFeishuPolling({
      config,
      logPath: '/tmp/feishu-polling-test.log',
      workDir: config.workDir,
      addUserInput: async () => 'input-test',
    }),
  ).rejects.toThrow('requires feishu.appId and feishu.appSecret')
})
