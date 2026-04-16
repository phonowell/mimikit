import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { readHistory } from '../../src/persistence/history/store.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'

import { createRuntime } from './testkit.js'

test('remember_memory writes MEMORY.md immediately and emits system event payload', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      type: 'remember_memory',
      content: 'User insists on always using strict ESM imports.',
      source_input_id: 'input-user',
      source_quote: 'always using strict ESM imports',
    },
  ])

  const memoryMarkdown = await readFile(runtime.paths.memoryFile, 'utf8')
  expect(memoryMarkdown).toContain('## [memory-entry] (id:')
  expect(memoryMarkdown).toContain(
    'User insists on always using strict ESM imports.',
  )

  const history = await readHistory(runtime.paths.history)
  const event = history.find(
    (item) =>
      item.role === 'system' && item.systemEventName === 'memory_remembered',
  )
  expect(event).toBeTruthy()
  expect(event?.systemEventPayload?.operation).toBe('created')
  expect(typeof event?.systemEventPayload?.entry_id).toBe('string')
})
