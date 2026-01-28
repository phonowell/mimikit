import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionStore } from '../src/session/store.js'
import { runTaskLoop } from '../src/runtime/master/task-loop.js'
import { runWorker } from '../src/runtime/worker.js'
import type { Config } from '../src/config.js'
import type { TaskRecord } from '../src/runtime/ledger/types.js'

vi.mock('../src/runtime/worker.js', () => ({
  runWorker: vi.fn(),
}))

const runWorkerMock = vi.mocked(runWorker)

const makeTempDir = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'mimikit-task-loop-'))

const makeConfig = (root: string): Config => ({
  workspaceRoot: root,
  timeoutMs: 5_000,
  maxWorkers: 1,
  maxIterations: 1,
  stateDir: root,
  taskLedgerMaxBytes: 20_000,
  taskLedgerMaxRecords: 1_000,
  taskLedgerAutoCompactIntervalMs: 600_000,
  memoryPaths: [],
  maxMemoryHits: 10,
  maxMemoryChars: 1000,
  resumePolicy: 'auto',
  outputPolicy: '',
  triggerSessionKey: 'system',
})

describe('runTaskLoop', () => {
  beforeEach(() => {
    runWorkerMock.mockReset()
    runWorkerMock.mockResolvedValue({ output: 'ok' })
  })

  it('refreshes session updatedAt after writing transcript', async () => {
    const root = await makeTempDir()
    const store = await SessionStore.load(root)
    const session = store.ensure('alpha')
    await store.flush()

    const before = store.get('alpha')?.updatedAt ?? ''
    await new Promise((resolve) => setTimeout(resolve, 5))

    const now = new Date().toISOString()
    const running: TaskRecord = {
      id: 'task-1',
      status: 'running',
      sessionKey: 'alpha',
      runId: 'run-1',
      retries: 0,
      attempt: 0,
      createdAt: now,
      updatedAt: now,
      resume: 'auto',
      prompt: 'hello',
    }

    const tasks = new Map<string, TaskRecord>([['task-1', running]])

    await runTaskLoop({
      config: makeConfig(root),
      sessionStore: store,
      tasks,
      running,
      prompt: 'hello',
      resumePolicy: 'auto',
      maxIterations: 1,
      session,
      memoryHits: [],
    })

    const reloaded = await SessionStore.load(root)
    const after = reloaded.get('alpha')?.updatedAt ?? ''
    expect(after).not.toBe(before)
    expect(reloaded.get('alpha')?.summary).toBe('hello')
  })
})
