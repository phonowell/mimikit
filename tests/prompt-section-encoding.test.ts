import { expect, test } from 'vitest'

import {
  encodePromptJsonSection,
} from '../src/prompts/build-prompts-helpers.js'

const tasksJson = JSON.stringify(
  {
    tasks: [
      { id: 'task-3', title: 'Task Three' },
      { id: 'task-2', title: 'Task Two' },
      { id: 'task-1', title: 'Task One' },
    ],
  },
  null,
  2,
)

test('encodePromptJsonSection trims by item and keeps JSON valid', () => {
  const maxBytes = Buffer.byteLength(
    JSON.stringify(
      {
        tasks: [
          { id: 'task-3', title: 'Task Three' },
          { id: 'task-2', title: 'Task Two' },
        ],
      },
      null,
      2,
    ),
    'utf8',
  )
  const encoded = encodePromptJsonSection(tasksJson, maxBytes)
  const parsed = JSON.parse(encoded) as {
    tasks?: Array<{ id?: string }>
  }

  expect(parsed.tasks?.map((item) => item.id)).toEqual(['task-3', 'task-2'])
})

test('encodePromptJsonSection returns empty when budget cannot fit any item', () => {
  const encoded = encodePromptJsonSection(tasksJson, 8)
  expect(encoded).toBe('')
})
