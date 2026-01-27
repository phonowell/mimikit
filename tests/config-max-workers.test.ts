import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadConfig } from '../src/config.js'

const withEnv = async (
  value: string | undefined,
  fn: () => Promise<void>,
): Promise<void> => {
  const previous = process.env.MIMIKIT_MAX_WORKERS
  if (value === undefined) {
    delete process.env.MIMIKIT_MAX_WORKERS
  } else {
    process.env.MIMIKIT_MAX_WORKERS = value
  }
  try {
    await fn()
  } finally {
    if (previous === undefined) {
      delete process.env.MIMIKIT_MAX_WORKERS
    } else {
      process.env.MIMIKIT_MAX_WORKERS = previous
    }
  }
}

const makeTempDir = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'mimikit-config-'))

describe('loadConfig maxWorkers', () => {
  it('defaults to 5 when unset', async () => {
    const root = await makeTempDir()
    const configPath = path.join(root, 'config.json')
    await withEnv(undefined, async () => {
      const config = await loadConfig({ workspaceRoot: root, configPath })
      expect(config.maxWorkers).toBe(5)
    })
  })

  it('uses env override when set', async () => {
    const root = await makeTempDir()
    const configPath = path.join(root, 'config.json')
    await withEnv('9', async () => {
      const config = await loadConfig({ workspaceRoot: root, configPath })
      expect(config.maxWorkers).toBe(9)
    })
  })
})
