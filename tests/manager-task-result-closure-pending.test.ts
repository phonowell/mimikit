import { expect, test, vi } from 'vitest'

vi.mock('../src/policy/memory/refresh/singleflight.js', () => ({
  requestMemoryRefresh: vi.fn(),
}))

import { readHistory } from '../src/persistence/history/store.js'
import { processManagerBatch } from '../src/policy/manager/loop-batch.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('processManagerBatch renders closure-pending result as not-yet-completed', async () => {
  const task = createTaskFixture({
    id: 'task-closure-pending',
    title: '收尾 output tokens 收缩',
    status: 'running',
    archivePath:
      '/tmp/mimikit/.mimikit/tasks/2026-04-01/task-closure-pending.md',
  })
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-closure-pending',
    patch: {
      tasks: [task],
    },
  })

  await processManagerBatch({
    runtime,
    inputs: [],
    results: [
      {
        taskId: task.id,
        status: 'succeeded',
        ok: true,
        output: '实现完成，待主仓收尾。',
        taskStatus: 'paused',
        outcome: 'blocked',
        stopReason: 'closure_pending',
        durationMs: 18,
        completedAt: '2026-04-01T04:08:00.000Z',
      },
    ],
    nextInputsCursor: 0,
    nextResultsCursor: 1,
  })

  const history = await readHistory(runtime.paths.history)
  expect(history.at(-1)).toMatchObject({
    role: 'agent',
    text: '任务 收尾 output tokens 收缩（task-closure-pending）：待收尾。\n实现完成，待主仓收尾。\n停下原因：closure_pending（待执行 merge/cleanup 收尾）\n[任务归档](.mimikit/tasks/2026-04-01/task-closure-pending.md)',
  })
})
