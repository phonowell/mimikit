import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { attachProviderThreadId } from '../src/shared/provider-thread-id.js'
import {
  MAX_CONTINUE_LATEST_OUTPUT_CHARS,
  buildContinuePrompt,
  hasDoneMarker,
  runWorkerLoop,
  stripDoneMarker,
} from '../src/worker/profiled-runner-loop.js'
import type { Task, TokenUsage } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-worker-loop-'))

test('done marker detection uses skill_usage done status only', () => {
  const doneOutput =
    '结论：已完成\n<M:skill_usage status="done">plan-implementation</M:skill_usage>'
  const doneOutputVariant =
    "结论：已完成\n<M:skill_usage source=\"x\" status = 'done'>plan-implementation</M:skill_usage>"
  const legacyOutput = '结论：已完成\n<M:task_done/>'

  expect(hasDoneMarker(doneOutput)).toBe(true)
  expect(hasDoneMarker(doneOutputVariant)).toBe(true)
  expect(stripDoneMarker(doneOutput)).toBe('结论：已完成')
  expect(stripDoneMarker(doneOutputVariant)).toBe('结论：已完成')
  expect(hasDoneMarker(legacyOutput)).toBe(false)
})

test('continue prompt clips latest output to configured max chars', () => {
  const template = '{{ latest_output }}\n{{ done_tag_pattern }}'
  const longOutput = `A${'b'.repeat(MAX_CONTINUE_LATEST_OUTPUT_CHARS + 300)}`
  const prompt = buildContinuePrompt(template, 'inline-template', longOutput, 2)
  const [latestLine] = prompt.split('\n')

  expect(latestLine?.length).toBeLessThanOrEqual(
    MAX_CONTINUE_LATEST_OUTPUT_CHARS,
  )
  expect(latestLine?.endsWith('...')).toBe(true)
  expect(prompt).toContain('<M:skill_usage status="done">')
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
          output: '<M:skill_usage status="done">test</M:skill_usage>',
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
          output: 'done\n<M:skill_usage status="done">test</M:skill_usage>',
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
