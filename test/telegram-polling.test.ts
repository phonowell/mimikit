import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  startTelegramPolling,
  stopTelegramPolling,
} from '../src/channels/telegram/index.js'
import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'

test('telegram polling validates required config on startup', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-telegram-polling-'))
  const config = defaultConfig({ workDir })
  config.telegram.enabled = true
  config.telegram.botToken = ''
  config.telegram.chatId = ''

  await expect(
    startTelegramPolling({
      config,
      logPath: buildPaths(workDir).log,
      workDir,
      addUserInput: async () => 'input-test',
    }),
  ).rejects.toThrow(
    '[config] telegram.enabled=true requires telegram.botToken and telegram.chatId',
  )

  await rm(workDir, { recursive: true, force: true })
})

test('telegram polling is skipped when channel disabled', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-telegram-polling-'))
  const config = defaultConfig({ workDir })
  config.telegram.enabled = false

  await expect(
    startTelegramPolling({
      config,
      logPath: buildPaths(workDir).log,
      workDir,
      addUserInput: async () => 'input-test',
    }),
  ).resolves.toBeUndefined()

  await stopTelegramPolling({
    workDir,
    logPath: buildPaths(workDir).log,
  })
  await rm(workDir, { recursive: true, force: true })
})
