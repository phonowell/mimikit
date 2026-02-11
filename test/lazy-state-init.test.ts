import { access, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import mkdir from 'fire-keeper/mkdir'
import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import { readReportingEvents } from '../src/reporting/events.js'
import { loadRuntimeSnapshot } from '../src/storage/runtime-state.js'
import { readHistory } from '../src/storage/jsonl.js'
import {
  loadInputQueueState,
  loadResultQueueState,
} from '../src/streams/queues.js'

const makeTmpStateDir = async (): Promise<string> => {
  const path = join(
    tmpdir(),
    `mimikit-lazy-state-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  await mkdir(path)
  return path
}

test('state files are created lazily when read', async () => {
  const stateDir = await makeTmpStateDir()
  const paths = buildPaths(stateDir)

  await expect(access(paths.history)).rejects.toBeDefined()
  await expect(access(paths.inputsState)).rejects.toBeDefined()
  await expect(access(paths.resultsState)).rejects.toBeDefined()
  await expect(access(join(stateDir, 'runtime-state.json'))).rejects.toBeDefined()
  await expect(access(join(stateDir, 'reporting', 'events.jsonl'))).rejects.toBeDefined()

  await expect(readHistory(paths.history)).resolves.toEqual([])
  await expect(loadInputQueueState(paths)).resolves.toEqual({ managerCursor: 0 })
  await expect(loadResultQueueState(paths)).resolves.toEqual({ managerCursor: 0 })
  await expect(loadRuntimeSnapshot(stateDir)).resolves.toEqual({
    tasks: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
  })
  await expect(readReportingEvents(stateDir)).resolves.toEqual([])

  await expect(readFile(paths.history, 'utf8')).resolves.toBe('')
  await expect(readFile(paths.inputsState, 'utf8')).resolves.toContain(
    '"managerCursor": 0',
  )
  await expect(readFile(paths.resultsState, 'utf8')).resolves.toContain(
    '"managerCursor": 0',
  )
  await expect(readFile(join(stateDir, 'runtime-state.json'), 'utf8')).resolves.toContain(
    '"tasks": []',
  )
  await expect(
    readFile(join(stateDir, 'reporting', 'events.jsonl'), 'utf8'),
  ).resolves.toBe('')
})

