import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

test('parseManagerTurn compacts clause-heavy out_of_scope before strict validation', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'enqueue_task',
        task: {
          title: '压缩单条 out_of_scope',
          cwd: '/tmp/mimikit',
          mode: 'read',
          use_worktree: false,
          goal: '保持 parse 放宽后仍能把 clause-heavy 的范围外说明收敛到 strict budget 内。',
          in_scope: ['只处理 out_of_scope 的 clause compaction'],
          out_of_scope: [
            [
              '不要扩展新的任务类型协议'.repeat(6),
              '不要放宽验收门禁'.repeat(6),
              '不要把 archive 正文回灌 manager'.repeat(3),
            ].join('；'),
          ],
          done_when: ['单条 out_of_scope 不再在 strict 校验阶段报超长'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
  })

  if (parsed.actions[0]?.type !== 'enqueue_task')
    throw new Error('expected task')
  expect(parsed.actions[0].task.out_of_scope).toEqual([
    `${'不要扩展新的任务类型协议'.repeat(6)}；${'不要放宽验收门禁'.repeat(6)}`,
  ])
})

test('parseManagerTurn compacts clause-heavy context_refs before strict validation', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'enqueue_task',
        task: {
          title: '压缩单条 context_refs',
          cwd: '/tmp/mimikit',
          mode: 'read',
          use_worktree: false,
          goal: '保持 parse 放宽后仍能把 clause-heavy 的上下文引用收敛到 strict budget 内。',
          in_scope: ['只处理 context_refs 的 clause compaction'],
          out_of_scope: [],
          done_when: ['单条 context_refs 不再在 strict 校验阶段报超长'],
          context_refs: [
            [
              `docs/${'workflow-'.repeat(8)}interfaces-and-state.md`,
              `docs/${'architecture-'.repeat(4)}system-architecture.md`,
              `docs/${'manager-'.repeat(8)}manager.md`,
            ].join('；'),
          ],
          instructions: [],
        },
      },
    ],
  })

  if (parsed.actions[0]?.type !== 'enqueue_task')
    throw new Error('expected task')
  expect(parsed.actions[0].task.context_refs).toEqual([
    `docs/${'workflow-'.repeat(8)}interfaces-and-state.md；docs/${'architecture-'.repeat(4)}system-architecture.md`,
  ])
})
