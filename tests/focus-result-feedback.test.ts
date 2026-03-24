import { expect, test } from 'vitest'

import { syncFocusFromTaskResult } from '../src/work/focus/result-feedback.js'
import type { Task, TaskResult } from '../src/foundation/types/index.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('syncFocusFromTaskResult updates summary but does not infer open items', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      focuses: [
        {
          id: 'focus-local',
          title: 'Local',
          status: 'active',
          createdAt: '2026-02-26T10:00:00.000Z',
          updatedAt: '2026-02-26T10:00:00.000Z',
          lastActivityAt: '2026-02-26T10:00:00.000Z',
          openItems: ['Keep existing digest'],
        },
      ],
    },
  })
  const task: Task = {
    id: 'task-1',
    fingerprint: 'task-1',
    prompt: 'cancel me',
    title: 'Cancel Me',
    cwd: runtime.config.workDir,
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
  }
  const result: TaskResult = {
    taskId: task.id,
    status: 'partial',
    ok: false,
    output: '- [ ] Resume after review',
    durationMs: 12,
    completedAt: '2026-02-26T10:00:13.000Z',
    handoff: {
      summary: 'Task paused after review checkpoint.',
      nextSteps: ['Resume after review'],
    },
  }

  syncFocusFromTaskResult(runtime, task, result)

  expect(runtime.focuses[0]?.summary).toBe('Task paused after review checkpoint.')
  expect(runtime.focuses[0]?.openItems).toEqual(['Keep existing digest'])
})
