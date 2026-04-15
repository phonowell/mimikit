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
import { formatManagerVisibleTaskResultReply } from '../src/policy/manager/task-result-visible-reply.js'

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
          '结论是：remember_memory 没有写入不是存储失败，而是当前输入 provenance 不成立，因此该辅助动作被静默丢弃，主回复继续保留。',
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
    text: '当前进展：我会继续按当前工作线推进并同步阶段结论。\n下一步：我会继续推进当前目标；如遇高风险或证据冲突，再抬给你决策。',
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

test('formatManagerVisibleTaskResultReply reports result progress naturally without leaking internal protocol terms', () => {
  const task = createTaskFixture({
    id: 'task-natural-reply',
    title: '收敛 manager 用户回复',
    archivePath: '/tmp/mimikit/.mimikit/tasks/2026-04-14/task-natural-reply.md',
  })

  const reply = formatManagerVisibleTaskResultReply({
    task,
    result: {
      taskId: task.id,
      status: 'succeeded',
      ok: true,
      output: 'raw output should stay hidden',
      durationMs: 18,
      completedAt: '2026-04-14T09:00:00.000Z',
      archivePath: task.archivePath,
      handoff: {
        summary: 'schema 对齐已经完成，结果可继续进入后续收尾。',
        risks: ['intent-evidence guard 仍可能拦住下一轮自动派发。'],
        nextSteps: ['enqueue_task 继续补齐 schema 收尾并归档。'],
      },
    },
    detail: 'schema 对齐已经完成，结果可继续进入后续收尾。',
    workDir: '/tmp/mimikit',
  })
  const lines = reply.split('\n')
  const leakedFragments = [
    'raw output should stay hidden',
    'enqueue_task',
    'intent-evidence',
  ]

  expect(lines.some((line) => line.startsWith('当前进展：'))).toBe(true)
  expect(lines.some((line) => line.startsWith('下一步：'))).toBe(true)
  expect(reply).toContain('[任务归档](')
  expect(leakedFragments.some((fragment) => reply.includes(fragment))).toBe(
    false,
  )
})
