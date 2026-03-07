import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { loadDefaultConfigFromToml } from '../src/config-default-loader.js'

const tempDirs: string[] = []

const writeTempConfig = async (source: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-feishu-config-loader-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.toml')
  await writeFile(path, source, 'utf8')
  return path
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

test('loads feishu config from toml', async () => {
  const path = await writeTempConfig(
    [
      '[feishu]',
      'enabled = true',
      'appId = "app-id"',
      'appSecret = "app-secret"',
      'chatId = "oc_chat_1"',
      '',
    ].join('\n'),
  )

  const config = loadDefaultConfigFromToml(path)

  expect(config.feishu.enabled).toBe(true)
  expect(config.feishu.appId).toBe('app-id')
  expect(config.feishu.appSecret).toBe('app-secret')
  expect(config.feishu.chatId).toBe('oc_chat_1')
})
