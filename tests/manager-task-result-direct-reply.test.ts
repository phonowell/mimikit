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
      text: '我会继续推进当前目标；如遇高风险或证据冲突，再抬给你决策。',
      actions: [],
    },
    usage: {
      input: 13,
      output: 8,
      total: 21,
    },
    elapsedMs: 25,
    diagnostics: {
      batchId: 'batch-manager-followup',
      roundCount: 1,
      roundId: 'round-manager-followup',
    },
  })
})

test('processManagerBatch routes single task_result batches through manager follow-up instead of direct reply fast path', async () => {
  const task = createTaskFixture({
    id: 'task-explain-reject',
    title: '解释 remember_memory provenance 校验被拒原因',
    status: 'running',
    archivePath:
      '/tmp/mimikit/.mimikit/tasks/2026-03-25/task-explain-reject.md',
  })
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit',
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
        output:
          '结论是：remember_memory 没有写入不是存储失败，而是 provenance 校验拒绝了该 action。\nsource_quote 没有命中当前用户输入原文，因此本轮不能写入长期记忆。',
        durationMs: 25,
        usage: {
          input: 13,
          output: 8,
          total: 21,
        },
        completedAt: '2026-03-25T06:08:56.942Z',
      },
    ],
    nextInputsCursor: 0,
    nextResultsCursor: 1,
  })

  expect(hoistedMocks.runManagerBatchMock).toHaveBeenCalledTimes(1)

  const history = await readHistory(runtime.paths.history)
  expect(history.at(-1)).toMatchObject({
    role: 'agent',
    text: '我会继续推进当前目标；如遇高风险或证据冲突，再抬给你决策。',
    usage: {
      input: 13,
      output: 8,
      total: 21,
    },
    elapsedMs: 25,
  })
  expect(runtime.domain.queues.resultsCursor).toBe(1)
})

test('processManagerBatch flushes pending restart after result-only manager follow-up', async () => {
  const requestExitMock = vi.fn()
  const task = createTaskFixture({
    id: 'task-direct-restart',
    title: '结果回合继续推进后触发 manager restart',
    status: 'running',
  })
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-direct-restart',
    patch: {
      tasks: [task],
      session: {
        pendingRestartReason: 'manager_restart_requested',
        requestExit: requestExitMock,
      },
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
        output: '直接回复正文',
        durationMs: 10,
        completedAt: '2026-03-28T08:00:00.000Z',
      },
    ],
    nextInputsCursor: 0,
    nextResultsCursor: 1,
  })

  expect(hoistedMocks.runManagerBatchMock).toHaveBeenCalledTimes(1)
  expect(requestExitMock).toHaveBeenCalledWith({
    code: 75,
    reason: 'manager_restart_requested',
    skipPersist: true,
  })
  expect(hoistedMocks.requestMemoryRefreshMock).not.toHaveBeenCalled()
})
