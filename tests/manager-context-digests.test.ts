import { expect, test } from 'vitest'

import { buildBatchResultsDigest } from '../src/policy/prompts/context-digests.js'
import { buildManagerContextPacket } from '../src/policy/prompts/manager-context-packet.js'
import { createTaskFixture } from './helpers/runtime-snapshot.js'

import type { TaskResult } from '../src/foundation/types/index.js'

test('buildBatchResultsDigest exposes stable summaries instead of raw result output', () => {
  const task = createTaskFixture({
    id: 'task-digest-1',
    title: 'Ship release',
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: 'RAW: internal rollout notes that should not be replayed',
    durationMs: 12,
    completedAt: '2026-03-24T10:00:00.000Z',
    handoff: {
      summary: 'Release is ready for review.',
    },
  }

  const digest = buildBatchResultsDigest({
    tasks: [task],
    results: [result],
    sourceText: '{"batch_results":"hidden"}',
  })
  const item = digest.payload.items[0] as Record<string, unknown>

  expect(item).toMatchObject({
    task_id: task.id,
    summary: 'Release is ready for review.',
  })
  expect(item).not.toHaveProperty('output')
  expect(item).not.toHaveProperty('handoff_summary')
})

test('buildManagerContextPacket latestResult falls back to status summary instead of raw output', () => {
  const task = createTaskFixture({
    id: 'task-digest-2',
    title: 'Ship release',
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'failed',
    ok: false,
    output: 'RAW: stack trace and internal executor logs',
    durationMs: 12,
    completedAt: '2026-03-24T10:00:00.000Z',
  }

  const { packet } = buildManagerContextPacket({
    wakeProfile: 'task_result',
    mode: 'minimal',
    inputs: [],
    results: [result],
    tasks: [task],
    plans: [],
    workingFocusIds: [],
    includedSections: ['packet_summary', 'batch_results', 'tasks'],
    prunedSections: [],
  })

  expect(packet.latestResult).toMatchObject({
    taskId: task.id,
    status: 'failed',
    summary: 'Task "Ship release" failed.',
  })
})
