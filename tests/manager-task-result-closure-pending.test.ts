import { beforeEach, expect, test, vi } from 'vitest'

const hoistedMocks = vi.hoisted(() => ({
  requestMemoryRefreshMock: vi.fn(),
  runManagerBatchMock: vi.fn(),
}))

vi.mock('../src/policy/memory/refresh/singleflight.js', () => ({
  requestMemoryRefresh: hoistedMocks.requestMemoryRefreshMock,
}))

vi.mock('../src/policy/manager/loop-batch-run-manager.js', () => ({
  runManagerBatch: hoistedMocks.runManagerBatchMock,
}))

import { readHistory } from '../src/persistence/history/store.js'
import { processManagerBatch } from '../src/policy/manager/loop-batch.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

beforeEach(() => {
  hoistedMocks.requestMemoryRefreshMock.mockClear()
  hoistedMocks.runManagerBatchMock.mockReset()
  hoistedMocks.runManagerBatchMock.mockResolvedValue({
    parsed: {
      text: '',
      actions: [],
    },
    usage: undefined,
    elapsedMs: 18,
    diagnostics: {
      batchId: 'batch-closure-pending',
      roundCount: 1,
      roundId: 'round-closure-pending',
    },
  })
})

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
    text: '当前进展：任务 收尾 output tokens 收缩（task-closure-pending）：待收尾。\n当前风险：停下原因：closure_pending（待执行 merge/cleanup 收尾）\n下一步：我会继续沿当前工作线推进后续收尾，并只在需要你拍板时再抬给你。\n[任务归档](.mimikit/tasks/2026-04-01/task-closure-pending.md)',
  })
})
