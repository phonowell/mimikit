import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { expect, test } from 'vitest'

import { runSerialized } from '../src/storage/serialized-lock.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-serialized-lock-'))

test('runSerialized clears queue after lock setup failure', async () => {
  const root = await createTmpDir()
  const blockedPath = join(root, 'blocked')
  const key = join(blockedPath, 'resource')

  await writeFile(blockedPath, 'x', 'utf8')
  await expect(runSerialized(key, async () => 'first')).rejects.toMatchObject({
    code: 'EEXIST',
  })

  await rm(blockedPath)
  await mkdir(blockedPath)

  const result = await Promise.race([
    runSerialized(key, async () => 'second'),
    delay(500).then(() => 'timeout'),
  ])

  expect(result).toBe('second')
})
