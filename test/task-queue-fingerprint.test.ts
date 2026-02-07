import { expect, test } from 'vitest'

import {
  buildTaskFingerprint,
  enqueueSystemEvolveTask,
  enqueueTask,
} from '../src/tasks/queue.js'
import type { Task } from '../src/types/index.js'

test('buildTaskFingerprint normalizes whitespace and case', () => {
  expect(buildTaskFingerprint('  Foo\n\tBar  ')).toBe('foo bar')
})

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

test('enqueueSystemEvolveTask dedupes active evolve task', () => {
  const tasks: Task[] = []
  const first = enqueueSystemEvolveTask(tasks)
  const second = enqueueSystemEvolveTask(tasks)
  expect(first.created).toBe(true)
  expect(second.created).toBe(false)
  expect(first.task.kind).toBe('system_evolve')
  expect(first.task.prompt).toBe('run evolve loop when idle')
  expect(second.task.id).toBe(first.task.id)
})
