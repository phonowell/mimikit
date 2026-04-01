import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import { buildManagerTurnOutputSchema } from '../src/policy/manager/manager-turn.js'

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

test('enqueue_task rejects oversized goal text to keep task contract compact', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          ...validTask,
          goal: 'g'.repeat(241),
        },
      },
    ],
    {},
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('task.goal')
})

test('set_plan rejects oversized nested task contract text', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: null,
        plan: {
          title: 'Nightly follow-up',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            ...validTask,
            goal: 'g'.repeat(241),
          },
          priority: 'normal',
          max_runs: 1,
        },
      },
    ],
    {},
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_plan')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('plan.task.goal')
})

test('manager turn structured output schema exposes nested task goal maxLength', () => {
  const outputSchema = buildManagerTurnOutputSchema().schema as {
    properties?: {
      actions?: {
        items?: {
          anyOf?: Array<{
            properties?: {
              type?: { const?: string }
              task?: { properties?: { goal?: { maxLength?: number } } }
              plan?: {
                properties?: {
                  task?: { properties?: { goal?: { maxLength?: number } } }
                }
              }
            }
          }>
        }
      }
    }
  }
  const actionBranches = outputSchema.properties?.actions?.items?.anyOf ?? []
  const enqueueTask = actionBranches.find(
    (branch) => branch.properties?.type?.const === 'enqueue_task',
  )
  const setPlan = actionBranches.find(
    (branch) => branch.properties?.type?.const === 'set_plan',
  )

  expect(enqueueTask?.properties?.task?.properties?.goal?.maxLength).toBe(240)
  expect(
    setPlan?.properties?.plan?.properties?.task?.properties?.goal?.maxLength,
  ).toBe(240)
})
