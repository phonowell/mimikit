import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendEvolveFeedback,
  getFeedbackReplaySuitePath,
  readEvolveFeedback,
  selectPendingFeedback,
  writeFeedbackReplaySuite,
} from '../src/evolve/feedback.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-evolve-feedback-'))

test('selectPendingFeedback applies processed offset and limit', () => {
  const feedback = [
    {
      id: '1',
      createdAt: '2026-02-07T00:00:00.000Z',
      kind: 'user_feedback' as const,
      severity: 'low' as const,
      message: 'a',
    },
    {
      id: '2',
      createdAt: '2026-02-07T00:00:01.000Z',
      kind: 'user_feedback' as const,
      severity: 'medium' as const,
      message: 'b',
    },
    {
      id: '3',
      createdAt: '2026-02-07T00:00:02.000Z',
      kind: 'user_feedback' as const,
      severity: 'high' as const,
      message: 'c',
    },
  ]
  const selected = selectPendingFeedback({
    feedback,
    processedCount: 1,
    historyLimit: 1,
  })
  expect(selected).toHaveLength(1)
  expect(selected[0]?.id).toBe('3')
})

test('writeFeedbackReplaySuite creates suite from feedback', async () => {
  const stateDir = await createTmpDir()
  await appendEvolveFeedback(stateDir, {
    id: 'fb-1',
    createdAt: '2026-02-07T00:00:00.000Z',
    kind: 'user_feedback',
    severity: 'high',
    message: 'response too vague',
    context: {
      input: '请给我可执行步骤',
      note: '步骤化回答',
    },
  })

  const feedback = await readEvolveFeedback(stateDir)
  const suite = await writeFeedbackReplaySuite({
    stateDir,
    feedback,
    maxCases: 10,
  })

  expect(suite).toBeTruthy()
  const suitePath = getFeedbackReplaySuitePath(stateDir)
  const suiteRaw = await readFile(suitePath, 'utf8')
  const parsed = JSON.parse(suiteRaw) as {
    suite: string
    cases: Array<{ id: string; expect?: { output?: { mustContain?: string[] } } }>
  }
  expect(parsed.suite).toBe('feedback-derived-suite')
  expect(parsed.cases).toHaveLength(1)
  expect(parsed.cases[0]?.id).toBe('feedback-1')
  expect(parsed.cases[0]?.expect?.output?.mustContain?.[0]).toBe('步骤化回答')
})
