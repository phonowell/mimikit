import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import { resolveWorkerPromptFromDraft } from '../src/policy/manager/task-contract.js'

const validTask = {
  title: 'Task with generated prompt',
  cwd: '/tmp/task-with-contract',
  mode: 'write' as const,
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

  expect(prompt).toContain('任务标题：Task with generated prompt')
  expect(prompt).toContain('目标：Finish task')
  expect(prompt).toContain('执行范围：Single deliverable')
  expect(prompt).toContain('不做：Do not change unrelated modules')
  expect(prompt).toContain(
    '上下文引用：docs/design/workflow/interfaces-and-state.md',
  )
  expect(prompt).toContain('完成标准：')
  expect(prompt).toContain('1. Output exists')
  expect(prompt).toContain('2. Tests pass')
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

  expect(source).not.toContain('任务标题：')
  expect(source).not.toContain('不做：')
  expect(source).not.toContain('上下文引用：')
  expect(source).not.toContain('补充说明：')

  expect(template).toContain('{{ title_label }}')
  expect(template).toContain('{{ out_of_scope_label }}')
  expect(template).toContain('{{ context_refs_label }}')
  expect(template).toContain('{{ extra_instructions_heading }}')
})

test('enqueue_task accepts complete task draft', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: validTask,
      },
    ],
    {},
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
