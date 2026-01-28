import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { SessionStore } from '../src/session/store.js'

const makeTempDir = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'mimikit-session-'))

describe('SessionStore.ensure', () => {
  it('creates unique transcript paths for colliding keys', async () => {
    const root = await makeTempDir()
    const store = await SessionStore.load(root)
    const first = store.ensure('alpha/beta')
    const second = store.ensure('alpha?beta')
    expect(first.transcriptPath).not.toBe(second.transcriptPath)
  })
})

describe('SessionStore.remove', () => {
  it('returns false for missing sessions', async () => {
    const root = await makeTempDir()
    const store = await SessionStore.load(root)
    await expect(store.remove('missing')).resolves.toBe(false)
  })

  it('deletes session files and record', async () => {
    const root = await makeTempDir()
    const store = await SessionStore.load(root)
    const record = store.ensure('alpha')
    await store.flush()

    await fs.mkdir(path.dirname(record.transcriptPath), { recursive: true })
    await fs.writeFile(record.transcriptPath, 'entry\n', 'utf8')
    await fs.writeFile(`${record.transcriptPath}.lock`, 'lock', 'utf8')

    const removed = await store.remove('alpha')
    expect(removed).toBe(true)
    expect(store.get('alpha')).toBeUndefined()
    await expect(fs.stat(record.transcriptPath)).rejects.toThrow()
    await expect(
      fs.stat(`${record.transcriptPath}.lock`),
    ).rejects.toThrow()
  })
})
