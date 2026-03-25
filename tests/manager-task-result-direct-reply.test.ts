import { expect, test } from 'vitest'

import { readHistory } from '../src/persistence/history/store.js'
import { resolveDirectTaskResultReply } from '../src/policy/manager/direct-task-result-reply.js'
import { processManagerBatch } from '../src/policy/manager/loop-batch.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('processManagerBatch directly delivers compact single task_result output', async () => {
  const task = createTaskFixture({
    id: 'task-explain-reject',
    title: '解释 remember_memory 被拒原因',
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
          '结论是：remember_memory 不是写入存储失败，而是在校验阶段被 intent-evidence guard 拦下了。\n最小补充是让用户直接声明这条规则需要跨轮长期生效。',
        durationMs: 25,
        completedAt: '2026-03-25T06:08:56.942Z',
      },
    ],
    nextInputsCursor: 0,
    nextResultsCursor: 1,
  })

  const history = await readHistory(runtime.paths.history)
  expect(history.at(-1)).toMatchObject({
    role: 'agent',
    text: '结论是：remember_memory 不是写入存储失败，而是在校验阶段被 intent-evidence guard 拦下了。\n最小补充是让用户直接声明这条规则需要跨轮长期生效。\n[任务归档](.mimikit/tasks/2026-03-25/task-explain-reject.md)',
  })
  expect(task.result?.output).toBe(`Task "${task.title}" completed.`)
  expect(runtime.queues.resultsCursor).toBe(1)
})

test('resolveDirectTaskResultReply rejects oversized output', () => {
  expect(
    resolveDirectTaskResultReply({
      inputs: [],
      results: [
        {
          taskId: 'task-long-output',
          status: 'succeeded',
          ok: true,
          output: `长输出\n${'x'.repeat(1300)}`,
          durationMs: 25,
          completedAt: '2026-03-25T06:08:56.942Z',
        },
      ],
    }),
  ).toBeUndefined()
})

test('resolveDirectTaskResultReply rejects mixed wake batches', () => {
  expect(
    resolveDirectTaskResultReply({
      inputs: [
        {
          id: 'input-user',
          role: 'user',
          text: '解释一下',
          createdAt: '2026-03-25T06:07:45.613Z',
          focusId: 'focus-global',
        },
      ],
      results: [
        {
          taskId: 'task-explain-reject',
          status: 'succeeded',
          ok: true,
          output: '结论正文',
          durationMs: 25,
          completedAt: '2026-03-25T06:08:56.942Z',
        },
      ],
    }),
  ).toBeUndefined()
})
