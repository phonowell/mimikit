import { expect, test } from 'vitest'
import { parse as parseYaml } from 'yaml'

import {
  encodePromptYamlSection,
} from '../src/prompts/build-prompts-helpers.js'

const tasksYaml = `tasks:
  - id: "task-3"
    title: "Task Three"
  - id: "task-2"
    title: "Task Two"
  - id: "task-1"
    title: "Task One"`

test('encodePromptYamlSection trims by item and keeps YAML valid', () => {
  const maxBytes = Buffer.byteLength(
    `tasks:
  - id: "task-3"
    title: "Task Three"
  - id: "task-2"
    title: "Task Two"`,
    'utf8',
  )
  const encoded = encodePromptYamlSection(tasksYaml, maxBytes)
  const parsed = parseYaml(encoded) as {
    tasks?: Array<{ id?: string }>
  }

  expect(parsed.tasks?.map((item) => item.id)).toEqual(['task-3', 'task-2'])
})

test('encodePromptYamlSection returns empty when budget cannot fit any item', () => {
  const encoded = encodePromptYamlSection(tasksYaml, 8)
  expect(encoded).toBe('')
})
