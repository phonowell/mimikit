import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  buildContinuePrompt,
  hasWorkerCompletionMarker,
  isWorkerBudgetExceededError,
  MAX_CONTINUE_LATEST_OUTPUT_CHARS,
  runWorkerLoop,
  stripWorkerProtocolTags,
} from '../src/worker/profiled-runner-loop.js'

import type { Task } from '../src/types/index.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-worker-loop-protocol-'))
const DONE_HANDOFF_TAG =
  '<M:task_handoff>{"summary":"已完成"}</M:task_handoff>'
const DONE_SKILL_TAG =
  '<M:skill_usage status="done">plan-implementation</M:skill_usage>'

test('completion detection requires task_handoff and skill_usage done tags', () => {
  const doneOutput = `结论：已完成\n${DONE_HANDOFF_TAG}\n${DONE_SKILL_TAG}`
  const doneOutputVariant =
    `结论：已完成\n${DONE_HANDOFF_TAG}\n<M:skill_usage source="x" status = 'done'>plan-implementation</M:skill_usage>`
  const missingHandoff = `结论：已完成\n${DONE_SKILL_TAG}`
  const invalidHandoff =
    '结论：已完成\n<M:task_handoff>{"next_steps":["x"]}</M:task_handoff>\n' +
    DONE_SKILL_TAG
  const legacyOutput = '结论：已完成\n<M:task_done/>'

  expect(hasWorkerCompletionMarker(doneOutput)).toBe(true)
  expect(hasWorkerCompletionMarker(doneOutputVariant)).toBe(true)
  expect(stripWorkerProtocolTags(doneOutput)).toBe('结论：已完成')
  expect(stripWorkerProtocolTags(doneOutputVariant)).toBe('结论：已完成')
  expect(hasWorkerCompletionMarker(missingHandoff)).toBe(false)
  expect(hasWorkerCompletionMarker(invalidHandoff)).toBe(false)
  expect(hasWorkerCompletionMarker(legacyOutput)).toBe(false)
})

test('continue prompt clips latest output and includes task_handoff pattern', () => {
  const template =
    '{{ latest_output }}\n{{ task_handoff_tag_pattern }}\n{{ done_tag_pattern }}'
  const longOutput = `A${'b'.repeat(MAX_CONTINUE_LATEST_OUTPUT_CHARS + 300)}`
  const prompt = buildContinuePrompt(template, 'inline-template', longOutput, 2)
  const [latestLine] = prompt.split('\n')

  expect(latestLine?.length).toBeLessThanOrEqual(
    MAX_CONTINUE_LATEST_OUTPUT_CHARS,
  )
  expect(latestLine?.endsWith('...')).toBe(true)
  expect(prompt).toContain('<M:task_handoff>')
  expect(prompt).toContain('<M:skill_usage status="done">')
})

test('runWorkerLoop treats done marker without task_handoff as incomplete and hits budget path', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-missing-handoff',
    fingerprint: 'fingerprint-missing-handoff',
    prompt: '执行测试任务',
    title: '执行测试任务',
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
        prompt: '执行测试任务',
        continueTemplate: '{{ latest_output }}',
        continueTemplatePath: 'inline-template',
        archiveBase: { role: 'worker', taskId: task.id },
        budget: {
          maxRounds: 1,
          maxDurationMs: 10_000,
        },
        runModel: async () => ({
          output: '<M:skill_usage status="done">test</M:skill_usage>',
          elapsedMs: 12,
        }),
      })
    } catch (error) {
      capturedError = error
    }

    expect(isWorkerBudgetExceededError(capturedError)).toBe(true)
    if (!isWorkerBudgetExceededError(capturedError))
      throw new Error('expected worker budget exceeded error')
    expect(capturedError.latestOutput).toContain(
      '<M:skill_usage status="done">test</M:skill_usage>',
    )
  } finally {
    await rm(stateDir, { recursive: true, force: true })
  }
})
