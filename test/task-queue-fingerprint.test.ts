import { expect, test } from 'vitest'

import { enqueueTask } from '../src/orchestrator/core/task-state.js'
import type { Task } from '../src/types/index.js'

test('enqueueTask dedupes active task by fingerprint', () => {
  const tasks: Task[] = []
  const first = enqueueTask(tasks, '  Build   API  ', 'First')
  const second = enqueueTask(tasks, 'build api', 'Second')
  expect(first.created).toBe(true)
  expect(second.created).toBe(false)
  expect(second.task.id).toBe(first.task.id)
  expect(tasks).toHaveLength(1)
})

test('enqueueTask allows recreate after completion', () => {
  const tasks: Task[] = []
  const first = enqueueTask(tasks, 'Refactor logs')
  first.task.status = 'succeeded'
  const second = enqueueTask(tasks, '  refactor   logs  ')
  expect(second.created).toBe(true)
  expect(second.task.id).not.toBe(first.task.id)
  expect(tasks).toHaveLength(2)
})
