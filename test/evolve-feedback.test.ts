import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  appendEvolveFeedback,
  buildIssueQueue,
  getFeedbackArchivePath,
  getIssueQueuePath,
  getFeedbackReplaySuitePath,
  persistIssueQueue,
  readEvolveFeedback,
  readIssueQueue,
  selectActionableIssues,
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
    issue: {
      category: 'quality',
      fingerprint: 'quality:response_too_vague',
      roiScore: 72,
      confidence: 0.85,
      action: 'fix',
    },
    context: {
      input: '请给我可执行步骤',
      note: '步骤化回答',
    },
  })

  const feedback = await readEvolveFeedback(stateDir)
  const issues = buildIssueQueue(feedback)
  const suite = await writeFeedbackReplaySuite({
    stateDir,
    issues,
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
  expect(parsed.cases[0]?.id).toBe('issue-1')
  expect(parsed.cases[0]?.expect?.output?.mustContain?.[0]).toBe('步骤化回答')
})

test('appendEvolveFeedback appends markdown archive entry', async () => {
  const stateDir = await createTmpDir()
  await appendEvolveFeedback(stateDir, {
    id: 'fb-archive-1',
    createdAt: '2026-02-07T00:10:00.000Z',
    kind: 'user_feedback',
    severity: 'medium',
    message: '回答太慢\n而且不够具体',
    context: {
      input: '请给可执行步骤',
      note: 'chat_feedback',
    },
  })

  const archivePath = getFeedbackArchivePath(stateDir)
  const archive = await readFile(archivePath, 'utf8')
  expect(archive.includes('## 2026-02-07T00:10:00.000Z fb-archive-1')).toBe(true)
  expect(archive.includes('- kind: user_feedback')).toBe(true)
  expect(archive.includes('- severity: medium')).toBe(true)
  expect(archive.includes('- message: 回答太慢 / 而且不够具体')).toBe(true)
  expect(archive.includes('- context.note: chat_feedback')).toBe(true)
})

test('buildIssueQueue deduplicates and sorts by roi', async () => {
  const stateDir = await createTmpDir()
  await appendEvolveFeedback(stateDir, {
    id: 'fb-i-1',
    createdAt: '2026-02-07T01:00:00.000Z',
    kind: 'runtime_signal',
    severity: 'high',
    message: 'worker failed timeout',
    issue: {
      category: 'failure',
      fingerprint: 'worker_failed:timeout',
      roiScore: 90,
      confidence: 0.9,
      action: 'fix',
    },
  })
  await appendEvolveFeedback(stateDir, {
    id: 'fb-i-2',
    createdAt: '2026-02-07T01:01:00.000Z',
    kind: 'runtime_signal',
    severity: 'medium',
    message: 'worker failed timeout again',
    issue: {
      category: 'failure',
      fingerprint: 'worker_failed:timeout',
      roiScore: 86,
      confidence: 0.8,
      action: 'fix',
    },
  })
  await appendEvolveFeedback(stateDir, {
    id: 'fb-i-3',
    createdAt: '2026-02-07T01:02:00.000Z',
    kind: 'user_feedback',
    severity: 'low',
    message: '希望回复更亲切',
    issue: {
      category: 'ux',
      fingerprint: 'ux:tone',
      roiScore: 18,
      confidence: 0.6,
      action: 'defer',
    },
  })

  const feedback = await readEvolveFeedback(stateDir)
  const issues = buildIssueQueue(feedback)
  expect(issues).toHaveLength(2)
  expect(issues[0]?.fingerprint).toBe('worker_failed:timeout')
  expect(issues[0]?.count).toBe(2)
  const actionable = selectActionableIssues({
    issues,
    minRoiScore: 35,
    maxCount: 10,
  })
  expect(actionable).toHaveLength(1)
  expect(actionable[0]?.fingerprint).toBe('worker_failed:timeout')

  await persistIssueQueue(stateDir, issues)
  const queuePath = getIssueQueuePath(stateDir)
  const queueRaw = await readFile(queuePath, 'utf8')
  expect(queueRaw.includes('worker_failed:timeout')).toBe(true)
  const queue = await readIssueQueue(stateDir)
  expect(queue.issues).toHaveLength(2)
})
