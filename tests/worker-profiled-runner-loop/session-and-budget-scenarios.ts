import { rm } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { attachProviderThreadId } from '../../src/execution/providers/thread-id.js'
import {
  isWorkerBudgetExceededError,
  runWorkerLoop,
} from '../../src/execution/worker/profiled-runner-loop.js'

import { createTask, createTmpDir } from './testkit.js'

test('runWorkerLoop captures provider thread id from error path for recovery', async () => {
  const stateDir = await createTmpDir()
  const sessionIds: string[] = []
  const task = createTask('test-session-error')

  try {
    await expect(
      runWorkerLoop({
        stateDir,
        task,
        prompt: task.prompt,
        continueTemplate: '{{ latest_output }}',
        continueTemplatePath: 'inline-template',
        archiveBase: { role: 'worker', taskId: task.id },
        runModel: async () => {
          throw attachProviderThreadId(
            new Error('simulated provider failure'),
            'session-from-error',
          )
        },
        onSessionId: async (sessionId) => {
          sessionIds.push(sessionId)
        },
      }),
    ).rejects.toThrow('simulated provider failure')

    expect(sessionIds).toEqual(['session-from-error'])
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})

test('runWorkerLoop omits latest output in continue prompt when thread id exists', async () => {
  const stateDir = await createTmpDir()
  const prompts: string[] = []
  const task = createTask('test-threaded-continue')

  try {
    const result = await runWorkerLoop({
      stateDir,
      task,
      prompt: task.prompt,
      continueTemplate: ['round={{ next_round }}', 'latest={{ latest_output }}'].join('\n'),
      continueTemplatePath: 'inline-template',
      archiveBase: { role: 'worker', taskId: task.id },
      runModel: async ({ prompt, threadId }) => {
        prompts.push(prompt)
        if (!threadId) {
          return {
            output: 'ROUND_ONE_SENTINEL',
            elapsedMs: 10,
            threadId: 'session-worker-1',
          }
        }
        return {
          output:
            'final\n<M:task_handoff>{"summary":"final"}</M:task_handoff>\n<M:skill_usage status=done>test</M:skill_usage>',
          elapsedMs: 10,
          threadId,
        }
      },
    })

    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('round=2')
    expect(prompts[1]).not.toContain('ROUND_ONE_SENTINEL')
    expect(result.output).toBe('final')
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})

test('runWorkerLoop raises partial budget error with latest output and session', async () => {
  const stateDir = await createTmpDir()
  const task = createTask('budget-partial', '执行预算测试任务')

  try {
    let capturedError: unknown
    try {
      await runWorkerLoop({
        stateDir,
        task,
        prompt: task.prompt,
        continueTemplate: 'round={{ next_round }}/{{ max_rounds }}\n{{ latest_output }}',
        continueTemplatePath: 'inline-template',
        archiveBase: { role: 'worker', taskId: task.id },
        budget: {
          maxRounds: 1,
          maxDurationMs: 5,
        },
        runModel: async () => ({
          output: 'partial draft without done marker',
          elapsedMs: 12,
          usage: { input: 4, output: 6, total: 10 },
          threadId: 'session-budget-1',
        }),
      })
    } catch (error) {
      capturedError = error
    }

    expect(isWorkerBudgetExceededError(capturedError)).toBe(true)
    if (!isWorkerBudgetExceededError(capturedError))
      throw new Error('expected worker budget exceeded error')
    expect(capturedError.latestOutput).toBe('partial draft without done marker')
    expect(capturedError.elapsedMs).toBe(12)
    expect(capturedError.round).toBe(1)
    expect(capturedError.threadId).toBe('session-budget-1')
    expect(capturedError.usage).toEqual({ input: 4, output: 6, total: 10 })
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})
