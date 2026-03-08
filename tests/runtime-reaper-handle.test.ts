import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import { createRuntimeReaperHandle } from '../src/runtime/reaper.js'

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(() => ({
      pid: 12345,
      unref: vi.fn(),
    })),
  }
})

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-reaper-handle-'))

const readText = (path: string): Promise<string> =>
  import('node:fs/promises').then(({ readFile }) => readFile(path, 'utf8'))

test('reaper handle registers and unregisters runtime child', async () => {
  const workDir = await createTmpDir()
  const paths = buildPaths(workDir)
  const handle = await createRuntimeReaperHandle({
    runtimeId: 'runtime-test',
    paths,
    runtimeLock: {
      path: join(workDir, '.instance'),
      release: async () => undefined,
    },
  })

  await handle.startHeartbeat()
  await handle.registerChild({
    id: 'runtime-child-1',
    kind: 'opencode-server',
    pid: 22222,
    meta: { model: 'big-pickle' },
  })

  const childrenRaw = await readText(paths.runtimeChildren)
  expect(childrenRaw).toContain('runtime-child-1')

  await handle.unregisterChild('runtime-child-1')
  const afterRaw = await readText(paths.runtimeChildren)
  expect(afterRaw).not.toContain('runtime-child-1')

  await handle.stopHeartbeat()
})
