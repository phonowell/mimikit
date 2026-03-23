import { expect, test } from 'vitest'

import { buildTaskViews } from '../src/orchestrator/read-model/task-view.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import type { Task } from '../src/types/index.js'

test('buildTaskViews does not derive title from prompt', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-prompt-only',
      title: '',
      prompt: 'raw prompt should not become title',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  expect(views[0]).toMatchObject({
    id: 'task-prompt-only',
    title: 'task-prompt-only',
  })
})
