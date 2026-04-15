import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import { resolveWorkerPromptFromDraft } from '../src/policy/manager/task-contract.js'

const validTask = {
  title: 'Task with generated prompt',
  cwd: '/tmp/task-with-contract',
  mode: 'read' as const,
  use_worktree: false,
  goal: 'Finish task',
  in_scope: ['Single deliverable'],
  out_of_scope: ['Do not change unrelated modules'],
  done_when: ['Output exists', 'Tests pass'],
  context_refs: ['docs/design/workflow/interfaces-and-state.md'],
  instructions: [],
}

test('enqueue_task requires goal/in_scope/done_when contract arrays', () => {
  const feedback = collectManagerActionFeedback([
    {
      type: 'enqueue_task',
      task: {
        title: 'Task without contract',
        cwd: '/tmp/task-without-contract',
        mode: 'write',
        goal: '',
        in_scope: [],
        out_of_scope: [],
        done_when: [],
        context_refs: [],
        instructions: [],
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('task.goal')
})

test('enqueue_task builds fallback worker prompt from task draft', () => {
  const prompt = resolveWorkerPromptFromDraft(validTask)
  const lines = prompt.split('\n').filter(Boolean)

  expect(
    lines.some((line) => line.includes('Task with generated prompt')),
  ).toBe(true)
  expect(lines.some((line) => line.includes('Finish task'))).toBe(true)
  expect(lines.some((line) => line.includes('Single deliverable'))).toBe(true)
  expect(
    lines.some((line) => line.includes('Do not change unrelated modules')),
  ).toBe(true)
  expect(
    lines.some((line) =>
      line.includes('docs/design/workflow/interfaces-and-state.md'),
    ),
  ).toBe(true)
  expect(lines.some((line) => line.includes('1. Output exists'))).toBe(true)
  expect(lines.some((line) => line.includes('2. Tests pass'))).toBe(true)
})

test('enqueue_task normalizes state-relative context refs in worker prompt output', () => {
  const prompt = resolveWorkerPromptFromDraft(
    {
      ...validTask,
      context_refs: [
        'tasks/2026-03-28/task-example.md',
        'generated/worker-task-prompts/2026-03-28/task-example.md',
        'docs/design/workflow/interfaces-and-state.md',
      ],
    },
    { stateDir: '/tmp/mimikit/.mimikit' },
  )
  const contextLine = prompt
    ?.split('\n')
    .find((line) => line.startsWith('上下文引用：'))

  expect(contextLine).toBe(
    '上下文引用：/tmp/mimikit/.mimikit/tasks/2026-03-28/task-example.md；/tmp/mimikit/.mimikit/generated/worker-task-prompts/2026-03-28/task-example.md；docs/design/workflow/interfaces-and-state.md',
  )
})

test('task contract prompt labels live in prompt template instead of source code', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/policy/manager/task-contract.ts'),
    'utf8',
  )
  const template = readFileSync(
    resolve(process.cwd(), 'prompts/manager/task-contract-worker-prompt.md'),
    'utf8',
  )

  expect(
    ['任务标题：', '不做：', '上下文引用：', '补充说明：'].some((label) =>
      source.includes(label),
    ),
  ).toBe(false)
  expect(
    [
      '{{ title_label }}',
      '{{ out_of_scope_label }}',
      '{{ context_refs_label }}',
      '{{ extra_instructions_heading }}',
    ].every((key) => template.includes(key)),
  ).toBe(true)
})

test('enqueue_task accepts complete task draft', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: validTask,
      },
    ],
    {
      inputs: [],
    },
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task rejects legacy flattened task fields', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: 'Task with legacy aliases',
          cwd: '/tmp/task-with-legacy-contract',
          mode: 'write',
          goal: 'Finish task',
          scope: 'Single deliverable',
          acceptance_1: 'Output exists',
        },
      } as unknown as Parameters<
        typeof collectManagerActionFeedback
      >[0][number],
    ],
    {},
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('scope')
})
