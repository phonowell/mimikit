import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  compactTaskLedger,
  formatTaskRecord,
  loadTaskLedger,
} from '../src/runtime/ledger.js'
import type { TaskRecord } from '../src/runtime/ledger/types.js'

const makeTempDir = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'mimikit-ledger-'))

describe('compactTaskLedger', () => {
  it('keeps only the latest record per task', async () => {
    const root = await makeTempDir()
    const filePath = path.join(root, 'tasks.md')

    const base: TaskRecord = {
      id: 'task-1',
      status: 'queued',
      sessionKey: 'alpha',
      runId: 'run-1',
      retries: 0,
      attempt: 0,
      createdAt: '2026-01-27T00:00:00.000Z',
      updatedAt: '2026-01-27T00:00:00.000Z',
      resume: 'auto',
      prompt: 'hello',
    }

    const running: TaskRecord = {
      ...base,
      status: 'running',
      attempt: 1,
      updatedAt: '2026-01-27T00:00:01.000Z',
    }

    const done: TaskRecord = {
      ...base,
      status: 'done',
      attempt: 1,
      updatedAt: '2026-01-27T00:00:02.000Z',
      result: 'ok',
    }

    const other: TaskRecord = {
      id: 'task-2',
      status: 'failed',
      sessionKey: 'beta',
      runId: 'run-2',
      retries: 0,
      attempt: 1,
      createdAt: '2026-01-27T00:00:03.000Z',
      updatedAt: '2026-01-27T00:00:04.000Z',
      resume: 'auto',
      prompt: 'ping',
      result: 'error',
    }

    const content = [base, running, done, other]
      .map((record) => formatTaskRecord(record))
      .join('')
    await fs.writeFile(filePath, content, 'utf8')

    const result = await compactTaskLedger(root)
    expect(result.records).toBe(4)
    expect(result.tasks).toBe(2)

    const compacted = await fs.readFile(filePath, 'utf8')
    expect((compacted.match(/^## Task /gm) ?? []).length).toBe(2)

    const tasks = await loadTaskLedger(root)
    expect(tasks.get('task-1')?.status).toBe('done')
    expect(tasks.get('task-1')?.result?.trim()).toBe('ok')
  })
})
