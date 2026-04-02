import { expect, test } from 'vitest'

import { syncFocusFromTaskResult } from '../src/work/focus/result-feedback.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
} from '../src/work/orchestrator/task-state.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { Task, TaskResult } from '../src/foundation/types/index.js'

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
    fingerprint: buildTaskFingerprint({
      prompt: 'cancel me',
      title: 'Cancel Me',
      cwd: runtime.config.workDir,
      profile: 'worker',
      provider: 'codex',
      focusId: 'focus-local',
    }),
    semanticKey: buildTaskSemanticKey({
      prompt: 'cancel me',
      title: 'Cancel Me',
      cwd: runtime.config.workDir,
      profile: 'worker',
      provider: 'codex',
      focusId: 'focus-local',
    }),
    executionSpecId: 'spec-task-1',
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
    status: 'failed',
    ok: false,
    output: '- [ ] Resume after review',
    durationMs: 12,
    completedAt: '2026-02-26T10:00:13.000Z',
    handoff: {
      summary: 'Task blocked pending review checkpoint.',
      nextSteps: ['Resume after review'],
    },
  }

  syncFocusFromTaskResult(runtime, task, result)

  expect(runtime.domain.focuses[0]?.summary).toBe(
    'Task blocked pending review checkpoint.',
  )
  expect(runtime.domain.focuses[0]?.openItems).toEqual(['Keep existing digest'])
})

test('syncFocusFromTaskResult falls back to stable status summary instead of raw output', async () => {
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
        },
      ],
    },
  })
  const task: Task = {
    id: 'task-2',
    fingerprint: buildTaskFingerprint({
      prompt: 'ship release',
      title: 'Ship Release',
      cwd: runtime.config.workDir,
      profile: 'worker',
      provider: 'codex',
      focusId: 'focus-local',
    }),
    semanticKey: buildTaskSemanticKey({
      prompt: 'ship release',
      title: 'Ship Release',
      cwd: runtime.config.workDir,
      profile: 'worker',
      provider: 'codex',
      focusId: 'focus-local',
    }),
    executionSpecId: 'spec-task-2',
    title: 'Ship Release',
    cwd: runtime.config.workDir,
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
  }
  const result: TaskResult = {
    taskId: task.id,
    status: 'failed',
    ok: false,
    output: 'RAW: stack trace and internal implementation details',
    durationMs: 12,
    completedAt: '2026-02-26T10:00:13.000Z',
  }

  syncFocusFromTaskResult(runtime, task, result)

  expect(runtime.domain.focuses[0]?.summary).toBe('Task "Ship Release" failed.')
})
