import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths, ensureStateDirs } from '../src/fs/paths.js'
import { readReportingEvents } from '../src/reporting/events.js'
import { loadRuntimeSnapshot } from '../src/storage/runtime-state.js'
import { readHistory } from '../src/storage/jsonl.js'
import {
  loadInputQueueState,
  loadResultQueueState,
} from '../src/streams/queues.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-state-dirs-'))

test('ensureStateDirs creates valid state files when state dir is missing', async () => {
  const rootDir = await createTmpDir()
  const stateDir = join(rootDir, '.mimikit')
  const paths = buildPaths(stateDir)

  await ensureStateDirs(paths)

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

  await expect(readFile(paths.feedback, 'utf8')).resolves.toBe('# Feedback\n\n')
  await expect(readFile(paths.userProfile, 'utf8')).resolves.toBe(
    '# User Profile\n\n',
  )
  await expect(readFile(paths.agentPersona, 'utf8')).resolves.toBe(
    '# Agent Persona\n\n',
  )
})

