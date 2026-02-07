import { expect, test } from 'vitest'

import {
  createSystemEvolveTask,
  createTask,
  pickNextPendingTask,
} from '../src/tasks/queue.js'
import type { Task } from '../src/types/index.js'

test('pickNextPendingTask prefers user task over system evolve', () => {
  const userTask = createTask('answer user request')
  const systemTask = createSystemEvolveTask()
  const tasks: Task[] = [systemTask, userTask]
  const selected = pickNextPendingTask(tasks, new Set())
  expect(selected?.id).toBe(userTask.id)
})

test('pickNextPendingTask falls back to system evolve when needed', () => {
  const systemTask = createSystemEvolveTask()
  const tasks: Task[] = [systemTask]
  const selected = pickNextPendingTask(tasks, new Set())
  expect(selected?.id).toBe(systemTask.id)
})
