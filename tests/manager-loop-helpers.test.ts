import { expect, test } from 'vitest'

import { buildFallbackReply } from '../src/policy/manager/loop-helpers.js'
import type { Task, TaskResult } from '../src/foundation/types/index.js'

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  fingerprint: 'task-1',
  prompt: 'ship release',
  title: 'Ship release',
  cwd: '/tmp/mimikit',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'succeeded',
  createdAt: '2026-03-23T10:00:00.000Z',
  ...overrides,
})

const createResult = (overrides: Partial<TaskResult> = {}): TaskResult => ({
  taskId: 'task-1',
  status: 'succeeded',
  ok: true,
  output: 'Raw worker output should stay out of fallback replies.',
  durationMs: 100,
  completedAt: '2026-03-23T10:05:00.000Z',
  ...overrides,
})

test('buildFallbackReply uses stable template for input-only rounds', async () => {
  await expect(
    buildFallbackReply({
      results: [],
      tasks: [],
      workDir: '/tmp/mimikit',
    }),
  ).resolves.toBe('收到，我继续处理。')
})

test('buildFallbackReply summarizes latest result instead of echoing raw output', async () => {
  const task = createTask({
    archivePath: '/tmp/mimikit/.mimikit/tasks/2026-03-23/task-1_ship-release.md',
  })
  const result = createResult({
    output: 'RAW: very long implementation details\nmore lines',
    handoff: {
      summary: 'Release branch is ready for review.',
    },
    archivePath: '/tmp/mimikit/.mimikit/tasks/2026-03-23/task-1_ship-release.md',
  })

  await expect(
    buildFallbackReply({
      results: [result],
      tasks: [task],
      workDir: '/tmp/mimikit',
    }),
  ).resolves.toBe(
    'Release branch is ready for review.\n[任务归档](.mimikit/tasks/2026-03-23/task-1_ship-release.md)',
  )
})
