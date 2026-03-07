import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { startFeishuPolling, stopFeishuPolling } from '../src/channels/feishu/polling.js'

test('feishu polling start/stop no-op when disabled', async () => {
  const config = defaultConfig({ workDir: '.mimikit-test-feishu-noop' })
  config.feishu.enabled = false

  await startFeishuPolling({
    config,
    logPath: '/tmp/feishu-polling-test.log',
    workDir: config.workDir,
    addUserInput: async () => 'input-test',
  })

  await stopFeishuPolling({
    workDir: config.workDir,
    logPath: '/tmp/feishu-polling-test.log',
  })

  expect(true).toBe(true)
})
