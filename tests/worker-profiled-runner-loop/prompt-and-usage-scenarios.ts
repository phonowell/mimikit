import { rm } from 'node:fs/promises'

import { expect, test } from 'vitest'

import {
  buildContinuePrompt,
  runWorkerLoop,
} from '../../src/execution/worker/profiled-runner-loop.js'

import { createTask, createTmpDir } from './testkit.js'

import type { TokenUsage } from '../../src/foundation/types/index.js'

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
  const task = createTask('test-usage')

  try {
    const result = await runWorkerLoop({
      stateDir,
      task,
      prompt: task.prompt,
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
  const task = createTask('test-partial')

  try {
    const result = await runWorkerLoop({
      stateDir,
      task,
      prompt: task.prompt,
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
