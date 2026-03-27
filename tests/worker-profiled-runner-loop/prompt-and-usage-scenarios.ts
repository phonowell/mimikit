import { rm } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { runWorkerLoop } from '../../src/execution/worker/profiled-runner-loop.js'

import { createTask, createTmpDir } from './testkit.js'

import type { TokenUsage } from '../../src/foundation/types/index.js'

test('runWorkerLoop does not double count when onUsage and result usage are identical', async () => {
  const stateDir = await createTmpDir()
  const usageEvents: TokenUsage[] = []
  const task = createTask('test-usage')

  try {
    const result = await runWorkerLoop({
      stateDir,
      task,
      prompt: task.title,
      archiveBase: { role: 'worker', taskId: task.id },
      runModel: ({ onUsage }) =>
        Promise.resolve({
          output: JSON.stringify({
            reply: 'done',
            handoff: { summary: 'done' },
          }),
          outputJson: {
            reply: 'done',
            handoff: { summary: 'done' },
          },
          elapsedMs: 12,
          usage: ((usage) => {
            onUsage?.(usage)
            return usage
          })({ input: 100, output: 50, total: 150 }),
        }),
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
    expect(result.traceRef).toMatch(
      /^\.mimikit\/traces\/\d{4}-\d{2}-\d{2}\/.+\.txt$/,
    )
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
      prompt: task.title,
      archiveBase: { role: 'worker', taskId: task.id },
      runModel: ({ onPartialOutput }) => {
        onPartialOutput?.('step 1')
        onPartialOutput?.('step 2')
        return Promise.resolve({
          output: JSON.stringify({
            reply: 'done',
            handoff: { summary: 'done' },
          }),
          outputJson: {
            reply: 'done',
            handoff: { summary: 'done' },
          },
          elapsedMs: 12,
        })
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
