import { expect, test } from 'vitest'

import { normalizeManagerReplyText } from '../src/policy/manager/reply-normalize.js'
import { formatManagerVisibleTaskResultReply } from '../src/policy/manager/task-result-visible-reply.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'

import type { TaskResult } from '../src/foundation/types/index.js'

test('normalizeManagerReplyText keeps ordinary dialogue natural in natural mode', () => {
  const normalized = normalizeManagerReplyText(
    [
      '当前进展：不是固定的，我可以更自然一点。',
      '下一步：如果你愿意，我可以直接像同事一样说话。',
    ].join('\n'),
    { mode: 'natural' },
  )

  expect(normalized).not.toContain('当前进展：')
  expect(normalized).not.toContain('下一步：')
  expect(normalized).toContain('不是固定的')
  expect(normalized).toContain('像同事一样说话')
})

test('normalizeManagerReplyText keeps task-result replies structured in structured mode', () => {
  const task = createTaskFixture({
    id: 'task-natural-reply',
    title: '收敛回复语气',
  })
  const result: TaskResult = {
    taskId: task.id,
    title: task.title,
    status: 'succeeded',
    ok: true,
    output: 'done',
    durationMs: 42,
    completedAt: '2026-04-15T08:00:00.000Z',
    taskStatus: 'paused',
    outcome: 'blocked',
    stopReason: 'closure_pending',
    handoff: {
      summary: '主线实现已经完成。',
      risks: ['还差 merge 和 cleanup。'],
      nextSteps: ['继续处理 merge 和 cleanup。'],
    },
    archivePath: '/tmp/task-natural-reply.md',
  }

  const visibleReply = formatManagerVisibleTaskResultReply({
    task,
    result,
    detail: result.handoff?.summary,
    workDir: '/tmp',
  })
  const normalized = normalizeManagerReplyText(visibleReply, {
    mode: 'structured',
  })

  expect(normalized).toContain('当前进展：')
  expect(normalized).toContain('当前风险：')
  expect(normalized).toContain('下一步：')
  expect(normalized).toContain('收敛回复语气')
})

test('normalizeManagerReplyText structured mode only upgrades explicit labels', () => {
  const normalized = normalizeManagerReplyText(
    [
      '阶段结论：主线实现已经完成。',
      '这一步还缺继续推进所需的授权和边界信息。',
      '请直接确认要继续的目标对象。',
    ].join('\n'),
    { mode: 'structured' },
  )

  expect(normalized).toContain('当前进展：主线实现已经完成。')
  expect(normalized).not.toContain('当前风险：')
  expect(normalized).not.toContain('需要你决定：')
  expect(normalized).toContain(
    '下一步：这一步还缺继续推进所需的授权和边界信息。 请直接确认要继续的目标对象。',
  )
})
