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
  ).resolves.toBe(
    '我会继续按当前目标推进；若出现高风险、证据冲突或需要改写目标/验收标准，我再抬给你决策。',
  )
})

test('buildFallbackReply summarizes latest result instead of echoing raw output', async () => {
  const task = createTask({
    archivePath:
      '/tmp/mimikit/.mimikit/tasks/2026-03-23/task-1_ship-release.md',
  })
  const result = createResult({
    output: 'RAW: very long implementation details\nmore lines',
    handoff: {
      summary: 'Release branch is ready for review.',
    },
    archivePath:
      '/tmp/mimikit/.mimikit/tasks/2026-03-23/task-1_ship-release.md',
  })

  await expect(
    buildFallbackReply({
      results: [result],
      tasks: [task],
      workDir: '/tmp/mimikit',
    }),
  ).resolves.toBe(
    '任务 Ship release（task-1）：已完成。\n阶段结论：Release branch is ready for review.\n[任务归档](.mimikit/tasks/2026-03-23/task-1_ship-release.md)',
  )
})

test('buildFallbackReply surfaces stop reason when result stops without summary', async () => {
  const task = createTask({
    status: 'failed',
  })
  const result = createResult({
    status: 'failed',
    ok: false,
    stopReason: 'input_required',
    archivePath: undefined,
  })

  await expect(
    buildFallbackReply({
      results: [result],
      tasks: [task],
      workDir: '/tmp/mimikit',
    }),
  ).resolves.toBe(
    '任务 Ship release（task-1）：已失败。\n当前风险：停下原因：input_required（需要补充输入）\n任务归档: 未生成',
  )
})
