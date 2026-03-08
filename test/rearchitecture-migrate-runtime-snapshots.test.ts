import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from 'vitest'

const execFileAsync = promisify(execFile)
const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-migrate-runtime-'))

test('migrate-runtime-snapshots script reports migrated and unchanged files', async () => {
  const root = await createTmpDir()
  const slotA = join(root, 'slot-a')
  const slotB = join(root, 'slot-b')
  const reportPath = join(root, 'report.json')

  await mkdir(slotA, { recursive: true })
  await mkdir(slotB, { recursive: true })

  await writeFile(
    join(slotA, 'runtime-snapshot.json'),
    JSON.stringify({
      tasks: [],
      taskPlans: [],
      managerTurn: 0,
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
      memoryRefresh: {
        lastCompletedTurn: 0,
        lastProcessedInputsCursor: 0,
        lastProcessedResultsCursor: 0,
      },
    }),
    'utf8',
  )

  await writeFile(
    join(slotB, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: 'runtime-snapshot.v2',
      tasks: [],
      taskPlans: [],
      managerTurn: 0,
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
      memoryRefresh: {
        lastCompletedTurn: 0,
        lastProcessedInputsCursor: 0,
        lastProcessedResultsCursor: 0,
      },
    }),
    'utf8',
  )

  const { stdout } = await execFileAsync(
    'pnpm',
    [
      'exec',
      'tsx',
      'scripts/rearchitecture/migrate-runtime-snapshots.ts',
      `--root=${root}`,
      '--write=false',
      `--output=${reportPath}`,
    ],
    { cwd: process.cwd() },
  )

  const parsed = JSON.parse(stdout) as {
    scanned: number
    migrated: number
    unchanged: number
    failed: number
  }

  expect(parsed.scanned).toBe(2)
  expect(parsed.migrated).toBe(1)
  expect(parsed.unchanged).toBe(1)
  expect(parsed.failed).toBe(0)
})
