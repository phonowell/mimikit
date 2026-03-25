import { beforeEach, expect, test, vi } from 'vitest'

import { formatEnqueueTaskIntentEvidenceHint } from '../src/policy/manager/action-evidence-hints.js'
import { runManagerCorrectionRounds } from '../src/policy/manager/loop-batch-run-rounds.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const { runManagerRoundWithRecoveryMock } = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

const { resolveRoundFollowupMock } = vi.hoisted(() => ({
  resolveRoundFollowupMock: vi.fn(),
}))

vi.mock('../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: runManagerRoundWithRecoveryMock,
}))

vi.mock('../src/policy/manager/loop-batch-round-followup.js', () => ({
  resolveRoundFollowup: resolveRoundFollowupMock,
}))

beforeEach(() => {
  runManagerRoundWithRecoveryMock.mockReset()
  resolveRoundFollowupMock.mockReset()
})

test('runManagerCorrectionRounds names the blocked follow-up when task_result-only context suggests a new task', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '<M:enqueue_task title="对齐 plan action schema 与 action-surface 文档（修复 trigger_mode 等不一致）" cwd="/tmp/task" goal="修复并对齐 mimikit 中 plan 相关 action 的 schema 与文档定义，消除 trigger_mode 等字段的不一致，确保编排 action 可稳定通过校验。" in_scope="只处理 schema 与文档对齐" done_when_1="typecheck passes" />',
    elapsedMs: 3,
    promptPrefixHash: 'prefix-hash',
    threadId: 'session-manager-evidence-followup',
  })
  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: false,
    extra: {
      actionFeedback: [
        {
          action: 'enqueue_task',
          error: 'action_execution_rejected',
          hint: formatEnqueueTaskIntentEvidenceHint('task_result'),
          code: 'intent_evidence_missing',
          attempted:
            '<M:enqueue_task title="对齐 plan action schema 与 action-surface 文档（修复 trigger_mode 等不一致）" cwd="/tmp/task" goal="修复并对齐 mimikit 中 plan 相关 action 的 schema 与文档定义，消除 trigger_mode 等字段的不一致，确保编排 action 可稳定通过校验。" in_scope="只处理 schema 与文档对齐" done_when_1="typecheck passes" />',
        },
      ],
    },
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-evidence-followup-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 3,
    resolveFocusId: () => 'focus-global',
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('系统原本想继续')
  expect(result.parsed.text).toContain('对齐 plan action schema')
  expect(result.parsed.text).toContain('不能只靠 task_result')
})

test('runManagerCorrectionRounds preserves quoted follow-up titles in blocked intent-evidence replies', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '<M:enqueue_task title="修复 \\\"trigger_mode\\\" 文档不一致" cwd="/tmp/task" goal="修复文档与 schema 不一致" in_scope="只处理 action docs" done_when_1="docs aligned" />',
    elapsedMs: 3,
    promptPrefixHash: 'prefix-hash',
    threadId: 'session-manager-evidence-quoted-followup',
  })
  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: false,
    extra: {
      actionFeedback: [
        {
          action: 'enqueue_task',
          error: 'action_execution_rejected',
          hint: formatEnqueueTaskIntentEvidenceHint('task_result'),
          code: 'intent_evidence_missing',
          attempted:
            '<M:enqueue_task title="修复 \\\"trigger_mode\\\" 文档不一致" cwd="/tmp/task" goal="修复文档与 schema 不一致" in_scope="只处理 action docs" done_when_1="docs aligned" />',
        },
      ],
    },
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-evidence-quoted-followup-test',
    withGlobalFocus: false,
  })

  const result = await runManagerCorrectionRounds({
    runtime,
    inputs: [],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds: 3,
    resolveFocusId: () => 'focus-global',
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('trigger_mode')
  expect(result.parsed.text).toContain('文档不一致')
})
