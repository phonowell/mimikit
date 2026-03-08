import { expect, test } from 'vitest'

import {
  buildTaskContractMissingHintFromAction,
  isTaskContractMissingHint,
} from '../src/manager/action-feedback-contract-hint.js'
import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'
import { TASK_CONTRACT_REQUIRED_HINT } from '../src/manager/task-contract.js'

test('enqueue_task missing contract feedback includes actionable xml template', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'run task',
        title: 'missing contract',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  const hint = feedback[0]?.hint ?? ''
  expect(hint).toContain(TASK_CONTRACT_REQUIRED_HINT)
  expect(hint).toContain('<M:enqueue_task prompt="run task"')
  expect(hint).toContain('goal=')
  expect(hint).toContain('scope=')
  expect(hint).toContain('acceptance_1=')
})

test('buildTaskContractMissingHintFromAction escapes xml attrs safely', () => {
  const hint = buildTaskContractMissingHintFromAction({
    name: 'enqueue_task',
    attrs: {
      prompt: 'a "quoted" prompt',
      title: 'title with \\ slash',
    },
  })

  expect(hint).toBeTruthy()
  expect(isTaskContractMissingHint(hint ?? '')).toBe(true)
  expect(hint).toContain('prompt="a \\"quoted\\" prompt"')
  expect(hint).toContain('title="title with \\\\ slash"')
})
