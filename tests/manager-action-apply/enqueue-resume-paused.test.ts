import { realpath } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { resolveWorkerPromptFromDraft } from '../../src/policy/manager/task-contract.js'
import { materializeTaskFixture } from '../helpers/execution-spec.js'

import { buildTaskDraft, createRuntime, TASK_CWD } from './testkit.js'

const defaultPrompt = resolveWorkerPromptFromDraft(buildTaskDraft())
if (!defaultPrompt) throw new Error('expected default task prompt')

test('enqueue_task resumes paused task when fingerprint matches exactly', async () => {
  const runtime = await createRuntime()
  const draft = buildTaskDraft()
  const taskCwd = await realpath(TASK_CWD)
  runtime.domain.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-paused',
        prompt: defaultPrompt,
        title: draft.title,
        cwd: taskCwd,
        resourceMode: draft.mode,
        contract: {
          goal: draft.goal,
          scope: draft.in_scope.join('；'),
          acceptance: draft.done_when,
        },
        focusId: 'focus-inbox',
        profile: 'worker',
        provider: 'codex',
        status: 'paused',
        pausedAt: '2026-02-13T00:10:00.000Z',
        createdAt: '2026-02-13T00:00:00.000Z',
      },
    }),
  )

  await applyTaskActions(runtime, [
    {
      type: 'enqueue_task',
      task: draft,
    },
  ])

  expect(runtime.domain.tasks).toHaveLength(1)
  expect(runtime.domain.tasks[0]?.id).toBe('task-paused')
  expect(runtime.domain.tasks[0]?.status).toBe('pending')
  expect(runtime.domain.tasks[0]?.pausedAt).toBeUndefined()
  expect(runtime.process.worker.queue.size).toBe(1)
})
