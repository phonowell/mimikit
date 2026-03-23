import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { attachProviderThreadId } from '../src/providers/thread-id.js'
import {
  buildContinuePrompt,
  isWorkerBudgetExceededError,
  runWorkerLoop,
} from '../src/worker/profiled-runner-loop.js'
import type { Task, TokenUsage } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-worker-loop-'))

test('continue prompt can omit latest output when thread context is available', () => {
  const template = [
    '当前轮次：{{ next_round }}/{{ max_rounds }}',
    '上一轮输出：',
    '{{ latest_output }}',
  ].join('\n')
  const prompt = buildContinuePrompt(
    template,
    'inline-template',
    'ROUND_ONE_SENTINEL',
    2,
    { includeLatestOutput: false },
  )

  expect(prompt).toContain('当前轮次：2/3')
  expect(prompt).not.toContain('ROUND_ONE_SENTINEL')
})

test('runWorkerLoop does not double count when onUsage and result usage are identical', async () => {
  const stateDir = await createTmpDir()
  const usageEvents: TokenUsage[] = []
  const task: Task = {
    id: 'task-test-usage',
    fingerprint: 'fingerprint-test-usage',
    prompt: '执行测试任务',
    title: '执行测试任务',
    focusId: 'focus-global',
    profile: 'worker',
    status: 'running',
    createdAt: '2026-03-04T00:00:00.000Z',
  }

  try {
    const result = await runWorkerLoop({
      stateDir,
      task,
      prompt: '执行测试任务',
      continueTemplate: '{{ latest_output }}',
      continueTemplatePath: 'inline-template',
      archiveBase: { role: 'worker', taskId: task.id },
      runModel: async ({ onUsage }) => {
        const usage = { input: 100, output: 50, total: 150 }
        onUsage?.(usage)
        return {
          output:
            'done\n<M:task_handoff>{"summary":"done"}</M:task_handoff>\n<M:skill_usage status="done">test</M:skill_usage>',
          elapsedMs: 12,
          usage,
        }
      },
      onUsage: (usage) => {
        usageEvents.push(usage)
      },
    })

    expect(result.usage).toEqual({ input: 100, output: 50, total: 150 })
    expect(task.usage).toEqual({ input: 100, output: 50, total: 150 })
    expect(usageEvents[usageEvents.length - 1]).toEqual({
      input: 100,
      output: 50,
      total: 150,
    })
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})

test('runWorkerLoop forwards partial output updates', async () => {
  const stateDir = await createTmpDir()
  const partialOutputs: string[] = []
  const task: Task = {
    id: 'task-test-partial',
    fingerprint: 'fingerprint-test-partial',
    prompt: '执行测试任务',
    title: '执行测试任务',
    focusId: 'focus-global',
    profile: 'worker',
    status: 'running',
    createdAt: '2026-03-04T00:00:00.000Z',
  }

  try {
    const result = await runWorkerLoop({
      stateDir,
      task,
      prompt: '执行测试任务',
      continueTemplate: '{{ latest_output }}',
      continueTemplatePath: 'inline-template',
      archiveBase: { role: 'worker', taskId: task.id },
      runModel: async ({ onPartialOutput }) => {
        onPartialOutput?.('step 1')
        onPartialOutput?.('step 2')
        return {
          output:
            'done\n<M:task_handoff>{"summary":"done"}</M:task_handoff>\n<M:skill_usage status="done">test</M:skill_usage>',
          elapsedMs: 12,
        }
      },
      onPartialOutput: (output) => {
        partialOutputs.push(output)
      },
    })

    expect(result.output).toBe('done')
    expect(partialOutputs).toEqual(['step 1', 'step 2'])
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})

test('runWorkerLoop captures provider thread id from error path for recovery', async () => {
  const stateDir = await createTmpDir()
  const sessionIds: string[] = []
  const task: Task = {
    id: 'task-test-session-error',
    fingerprint: 'fingerprint-test-session-error',
    prompt: '执行测试任务',
    title: '执行测试任务',
    focusId: 'focus-global',
    profile: 'worker',
    status: 'running',
    createdAt: '2026-03-04T00:00:00.000Z',
  }

  try {
    await expect(
      runWorkerLoop({
        stateDir,
        task,
        prompt: '执行测试任务',
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
  const task: Task = {
    id: 'task-test-threaded-continue',
    fingerprint: 'fingerprint-test-threaded-continue',
    prompt: '执行测试任务',
    title: '执行测试任务',
    focusId: 'focus-global',
    profile: 'worker',
    status: 'running',
    createdAt: '2026-03-04T00:00:00.000Z',
  }

  try {
    const result = await runWorkerLoop({
      stateDir,
      task,
      prompt: '执行测试任务',
      continueTemplate: [
        'round={{ next_round }}',
        'latest={{ latest_output }}',
      ].join('\n'),
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
  const task: Task = {
    id: 'task-budget-partial',
    fingerprint: 'fingerprint-budget-partial',
    prompt: '执行预算测试任务',
    title: '执行预算测试任务',
    focusId: 'focus-global',
    profile: 'worker',
    status: 'running',
    createdAt: '2026-03-04T00:00:00.000Z',
  }

  try {
    let capturedError: unknown
    try {
      await runWorkerLoop({
        stateDir,
        task,
        prompt: '执行预算测试任务',
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
