import { afterEach, expect, test, vi } from 'vitest'

import { readJsonl } from '../../src/persistence/storage/jsonl.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'

import { createRuntime } from './testkit.js'

import type * as MemoryEntryModule from '../../src/work/memory/remember-entry.js'

const hoistedMocks = vi.hoisted(() => ({
  rememberMemoryEntryMock: vi.fn(),
}))

vi.mock('../../src/work/memory/remember-entry.js', async () => {
  const actual = await vi.importActual<MemoryEntryModule>(
    '../../src/work/memory/remember-entry.js',
  )
  return {
    ...actual,
    rememberMemoryEntry: hoistedMocks.rememberMemoryEntryMock,
  }
})

afterEach(() => {
  hoistedMocks.rememberMemoryEntryMock.mockReset()
})

test('remember_memory write failure appends apply feedback without blocking later actions', async () => {
  hoistedMocks.rememberMemoryEntryMock.mockRejectedValueOnce(
    new Error('disk full while writing memory'),
  )
  const runtime = await createRuntime()
  runtime.domain.tasks.push({
    id: 'task-focus-memory-failsoft',
    fingerprint: 'fp-memory-failsoft',
    prompt: 'do something',
    title: 'focus task',
    cwd: '/tmp/focus-memory-failsoft',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })
  runtime.domain.focuses.push({
    id: 'focus-memory-failsoft',
    title: 'Memory Failsoft',
    status: 'active',
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    lastActivityAt: '2026-02-13T00:00:00.000Z',
  })

  await expect(
    applyTaskActions(runtime, [
      {
        type: 'remember_memory',
        content: 'Always keep replies concise.',
        source_input_id: 'input-user',
        source_quote: 'keep replies concise',
      },
      {
        type: 'assign_focus',
        target_type: 'task',
        target_id: 'task-focus-memory-failsoft',
        focus_id: 'focus-memory-failsoft',
      },
    ]),
  ).resolves.toBeUndefined()

  expect(runtime.domain.tasks[0]?.focusId).toBe('focus-memory-failsoft')
  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  const feedback = logs.find(
    (entry) => entry.event === 'manager_action_apply_feedback',
  )
  expect(feedback).toMatchObject({
    action: 'remember_memory',
    error: 'action_execution_rejected',
  })
})
