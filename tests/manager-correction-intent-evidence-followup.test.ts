import { expect, test } from 'vitest'

import { formatEnqueueTaskIntentEvidenceHint } from '../src/policy/manager/action-evidence-hints.js'

import {
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

test('runManagerCorrectionRounds keeps blocked follow-up replies generic when task_result-only context suggests a new task', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce(
    buildRoundResult({
      output:
        '<M:enqueue_task title="对齐 plan action schema 与 action-surface 文档（修复 trigger_mode 等不一致）" cwd="/tmp/task" goal="修复并对齐 mimikit 中 plan 相关 action 的 schema 与文档定义，消除 trigger_mode 等字段的不一致，确保编排 action 可稳定通过校验。" in_scope="只处理 schema 与文档对齐" done_when_1="typecheck passes" />',
      actions: [
        {
          type: 'enqueue_task',
          task: {
            title:
              '对齐 plan action schema 与 action-surface 文档（修复 trigger_mode 等不一致）',
            cwd: '/tmp/task',
            mode: 'write',
            goal: '修复并对齐 mimikit 中 plan 相关 action 的 schema 与文档定义，消除 trigger_mode 等字段的不一致，确保编排 action 可稳定通过校验。',
            in_scope: ['只处理 schema 与文档对齐'],
            out_of_scope: [],
            done_when: ['typecheck passes'],
            context_refs: [],
            instructions: [],
          },
        },
      ],
      wakeProfile: 'task_result',
      threadId: 'session-manager-evidence-followup',
    }),
  )
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

  const runtime = await createCorrectionRuntime('evidence-followup')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [],
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('enqueue_task 动作无法继续执行')
  expect(result.parsed.text).toContain('intent-evidence guard 未通过')
  expect(result.parsed.text).toContain('task_result')
  expect(result.parsed.text).not.toContain('对齐 plan action schema')
})

test('runManagerCorrectionRounds does not replay quoted follow-up titles in blocked intent-evidence replies', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce(
    buildRoundResult({
      output:
        '<M:enqueue_task title="修复 \\\"trigger_mode\\\" 文档不一致" cwd="/tmp/task" goal="修复文档与 schema 不一致" in_scope="只处理 action docs" done_when_1="docs aligned" />',
      actions: [
        {
          type: 'enqueue_task',
          task: {
            title: '修复 "trigger_mode" 文档不一致',
            cwd: '/tmp/task',
            mode: 'write',
            goal: '修复文档与 schema 不一致',
            in_scope: ['只处理 action docs'],
            out_of_scope: [],
            done_when: ['docs aligned'],
            context_refs: [],
            instructions: [],
          },
        },
      ],
      wakeProfile: 'task_result',
      threadId: 'session-manager-evidence-quoted-followup',
    }),
  )
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

  const runtime = await createCorrectionRuntime('evidence-quoted-followup')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [],
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('intent-evidence guard 未通过')
  expect(result.parsed.text).toContain('task_result')
  expect(result.parsed.text).not.toContain('trigger_mode')
})
