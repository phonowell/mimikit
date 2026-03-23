import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendManagerUsageLedgerEntry,
  appendWorkerUsageLedgerEntry,
} from '../src/storage/usage-ledger.js'

test('appendManagerUsageLedgerEntry writes manager round packet with token usage', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-usage-ledger-manager-'))

  await appendManagerUsageLedgerEntry({
    stateDir,
    wakeProfile: 'user_input',
    packetMode: 'standard',
    contextPacket: {
      id: 'packet-context-1',
      createdAt: '2026-03-10T00:00:00.000Z',
      wakeProfile: 'user_input',
      mode: 'standard',
      counts: {
        inputs: 1,
        results: 0,
        tasks: 1,
        plans: 0,
        workingFocuses: 1,
      },
      activeTaskIds: ['task-1'],
      workingFocusIds: ['focus-global'],
      sectionDigests: [
        {
          section: 'batch_results',
          mode: 'digest',
          sourceBytes: 4096,
          digestBytes: 1024,
          sourceItems: 6,
          digestItems: 2,
          sourceRefCount: 2,
        },
      ],
      includedSections: ['packet_summary', 'inputs', 'tasks'],
      prunedSections: ['memory'],
    },
    usage: {
      input: 120,
      output: 40,
      total: 160,
    },
    elapsedMs: 1500,
    threadId: 'session-manager-1',
    model: 'gpt-5',
    promptBytes: 2048,
    promptSegmentCount: 3,
  })

  const raw = await readFile(join(stateDir, 'usage', 'ledger.jsonl'), 'utf8')
  const [entry] = raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)

  expect(entry?.kind).toBe('manager_round')
  expect(entry?.provider).toBe('openai-responses')
  expect(entry?.focusIds).toEqual(['focus-global'])
  expect(entry?.promptBytes).toBe(2048)
  expect(entry?.promptSegmentCount).toBe(3)
  expect(entry?.sectionDigests).toEqual([
    {
      section: 'batch_results',
      mode: 'digest',
      sourceBytes: 4096,
      digestBytes: 1024,
      sourceItems: 6,
      digestItems: 2,
      sourceRefCount: 2,
    },
  ])
})

test('appendWorkerUsageLedgerEntry writes worker result packet with provider and task scope', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-usage-ledger-worker-'))

  await appendWorkerUsageLedgerEntry({
    stateDir,
    focusId: 'focus-release',
    taskId: 'task-release-1',
    provider: 'codex',
    usage: {
      input: 320,
      output: 80,
      total: 400,
    },
    elapsedMs: 3200,
    threadId: 'session-worker-1',
    model: 'gpt-5-codex',
    status: 'succeeded',
  })

  const raw = await readFile(join(stateDir, 'usage', 'ledger.jsonl'), 'utf8')
  const [entry] = raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)

  expect(entry?.kind).toBe('worker_result')
  expect(entry?.focusId).toBe('focus-release')
  expect(entry?.taskId).toBe('task-release-1')
  expect(entry?.provider).toBe('codex')
  expect(entry?.status).toBe('succeeded')
})
