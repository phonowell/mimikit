import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendLog,
  resolveReadableLogPath,
} from '../src/persistence/log/append.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-log-readable-'))

test('appendLog writes a stable readable mirror beside the rotating jsonl log', async () => {
  const stateDir = await createTmpDir()
  const logPath = join(stateDir, 'log.jsonl')

  await appendLog(logPath, {
    event: 'worker_end',
    taskId: 'task-readable-log',
    status: 'succeeded',
  })

  const readablePath = resolveReadableLogPath(logPath)
  const content = await readFile(readablePath, 'utf8')
  expect(content).toContain('"schema":"mimikit.log.v2"')
  expect(content).toContain('"event":"worker_end"')
  expect(content).toContain('"taskId":"task-readable-log"')
  expect(content).toContain('"status":"succeeded"')
})

test('appendLog truncates an oversized readable mirror instead of growing forever', async () => {
  const stateDir = await createTmpDir()
  const logPath = join(stateDir, 'log.jsonl')
  const readablePath = resolveReadableLogPath(logPath)
  await writeFile(readablePath, 'x'.repeat(10 * 1024 * 1024), 'utf8')
  const before = await stat(readablePath)

  await appendLog(logPath, {
    event: 'worker_end',
    taskId: 'task-readable-log-capped',
    status: 'succeeded',
  })

  const after = await stat(readablePath)
  const content = await readFile(readablePath, 'utf8')
  expect(after.size).toBeLessThan(before.size)
  expect(content).toContain('"taskId":"task-readable-log-capped"')
  expect(content).not.toContain('"task-readable-log"')
})
