import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { runWorkerLoop } from '../src/execution/worker/profiled-runner-loop.js'
import {
  buildWorkerTurnOutputSchema,
  parseWorkerTurn,
} from '../src/execution/worker/worker-turn.js'

import type { Task } from '../src/foundation/types/index.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-worker-loop-protocol-'))

const createTask = (id: string): Task => ({
  id,
  fingerprint: `fingerprint-${id}`,
  semanticKey: `semantic-${id}`,
  executionSpecId: `spec-${id}`,
  title: '执行测试任务',
  cwd: '/tmp/worker-loop-protocol',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-04T00:00:00.000Z',
})

test('worker structured output schema requires reply and allows optional handoff', () => {
  expect(buildWorkerTurnOutputSchema()).toMatchObject({
    type: 'json_schema',
    name: 'worker_turn',
    strict: true,
    schema: {
      type: 'object',
      required: ['reply', 'handoff'],
      additionalProperties: false,
      properties: {
        handoff: {
          anyOf: expect.any(Array),
        },
      },
    },
  })

  expect(
    parseWorkerTurn({
      reply: '结论：已完成',
    }),
  ).toEqual({
    reply: '结论：已完成',
  })

  expect(
    parseWorkerTurn({
      reply: '结论：已完成',
      handoff: {
        summary: '已完成',
        next_steps: ['继续观察'],
      },
    }),
  ).toEqual({
    reply: '结论：已完成',
    handoff: {
      summary: '已完成',
      next_steps: ['继续观察'],
    },
  })

  expect(
    parseWorkerTurn({
      reply: '结论：已完成',
      handoff: {
        summary: '已完成',
        decisions: null,
        artifacts: [{ path: '/tmp/report.md', kind: null, note: null }],
      },
    }),
  ).toEqual({
    reply: '结论：已完成',
    handoff: {
      summary: '已完成',
      artifacts: [{ path: '/tmp/report.md' }],
    },
  })

  expect(
    parseWorkerTurn({
      reply: 'legacy',
      legacy_done_marker: { status: 'done' },
    }),
  ).toEqual({
    reply: 'legacy',
  })

  expect(
    parseWorkerTurn({
      reply: '结论：已完成',
      handoff: {
        summary: '已完成',
        unexpected: 'noise',
      },
    }),
  ).toEqual({
    reply: '结论：已完成',
    handoff: {
      summary: '已完成',
    },
  })
})

test('runWorkerLoop rejects non-structured worker output immediately', async () => {
  const stateDir = await createTmpDir()
  const task = createTask('missing-structured-output')

  try {
    await expect(
      runWorkerLoop({
        stateDir,
        task,
        prompt: '执行测试任务',
        archiveBase: { role: 'worker', taskId: task.id },
        runModel: () =>
          Promise.resolve({
            output: 'legacy text output',
            elapsedMs: 12,
          }),
      }),
    ).rejects.toThrow('missing structured result')
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})

test('runWorkerLoop keeps reply when structured handoff is malformed', async () => {
  const stateDir = await createTmpDir()
  const task = createTask('malformed-handoff')

  try {
    const result = await runWorkerLoop({
      stateDir,
      task,
      prompt: '执行测试任务',
      archiveBase: { role: 'worker', taskId: task.id },
      runModel: () =>
        Promise.resolve({
          output: JSON.stringify({
            reply: '已完成主任务',
            handoff: {
              summary: 'done',
              unexpected: 'noise',
            },
          }),
          elapsedMs: 12,
        }),
    })

    expect(result.output).toBe('已完成主任务')
    expect(result.handoff).toEqual({ summary: 'done' })
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})
