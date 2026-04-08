import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import type * as FsPromises from 'node:fs/promises'

const hoistedMocks = vi.hoisted(() => ({
  appendFileMock: vi.fn(() => Promise.reject(new Error('mirror write failed'))),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof FsPromises
  return {
    ...actual,
    appendFile: hoistedMocks.appendFileMock,
  }
})

const { appendLog } = await import('../src/persistence/log/append.js')

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-log-failsoft-'))

test('appendLog stays fail-soft when readable mirror write fails', async () => {
  const stateDir = await createTmpDir()
  const logPath = join(stateDir, 'log.jsonl')

  await expect(
    appendLog(logPath, {
      event: 'worker_end',
      taskId: 'task-readable-log-failsoft',
      status: 'succeeded',
    }),
  ).resolves.toBeUndefined()
})
