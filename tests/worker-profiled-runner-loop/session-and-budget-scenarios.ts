import { rm } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { attachProviderThreadId } from '../../src/execution/providers/thread-id.js'
import { runWorkerLoop } from '../../src/execution/worker/profiled-runner-loop.js'

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
        prompt: task.title,
        archiveBase: { role: 'worker', taskId: task.id },
        runModel: () => {
          throw attachProviderThreadId(
            new Error('simulated provider failure'),
            'session-from-error',
          )
        },
        onSessionId: (sessionId) => {
          sessionIds.push(sessionId)
          return Promise.resolve()
        },
      }),
    ).rejects.toThrow('simulated provider failure')

    expect(sessionIds).toEqual(['session-from-error'])
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})

test('runWorkerLoop attaches provider diagnostics to archived failure errors', async () => {
  const stateDir = await createTmpDir()
  const task = createTask('test-provider-diagnostics-error')

  try {
    let caught: unknown
    try {
      await runWorkerLoop({
        stateDir,
        task,
        prompt: task.title,
        archiveBase: {
          role: 'worker',
          taskId: task.id,
          providerCallId: 'call-worker-loop-1',
          attemptNumber: 2,
        },
        runModel: () => {
          throw new Error('simulated provider failure')
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(Reflect.get(caught as object, 'providerCallId')).toBe(
      'call-worker-loop-1',
    )
    expect(Reflect.get(caught as object, 'attempt')).toBe(2)
    expect(Reflect.get(caught as object, 'traceRef')).toMatch(
      /^\.mimikit\/traces\/\d{4}-\d{2}-\d{2}\/.+\.txt$/,
    )
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})

test('runWorkerLoop makes a single provider call and fails when completion protocol is missing', async () => {
  const stateDir = await createTmpDir()
  const prompts: string[] = []
  const task = createTask('test-threaded-continue')

  try {
    await expect(
      runWorkerLoop({
        stateDir,
        task,
        prompt: task.title,
        archiveBase: { role: 'worker', taskId: task.id },
        runModel: ({ prompt }) => {
          prompts.push(prompt)
          return Promise.resolve({
            output: 'ROUND_ONE_SENTINEL',
            elapsedMs: 10,
            threadId: 'session-worker-1',
          })
        },
      }),
    ).rejects.toThrow('missing structured result')

    expect(prompts).toEqual([task.title])
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})
