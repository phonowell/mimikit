import { access, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { acquireRuntimeLock } from '../src/bootstrap/cli/runtime-lock.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-lock-'))

test('acquireRuntimeLock blocks concurrent acquire and allows acquire after release', async () => {
  const workDir = await createTmpDir()
  const first = await acquireRuntimeLock(workDir)

  await expect(access(first.path)).resolves.toBeUndefined()
  expect(first.path).toBe(join(workDir, '.instance.lock'))

  await expect(acquireRuntimeLock(workDir)).rejects.toThrow(
    `[cli] instance lock exists at ${join(workDir, '.instance.lock')}`,
  )

  await first.release()
  await expect(access(first.path)).rejects.toMatchObject({ code: 'ENOENT' })
  const second = await acquireRuntimeLock(workDir)
  await second.release()
})

test('acquireRuntimeLock preserves non-lock errors from workdir setup', async () => {
  const root = await createTmpDir()
  const filePath = join(root, 'occupied-by-file')
  await writeFile(filePath, 'x', 'utf8')

  await expect(acquireRuntimeLock(filePath)).rejects.toMatchObject({
    code: 'EEXIST',
  })
})
