import { expect, test } from 'vitest'

import { normalizeManagerReplyText } from '../src/policy/manager/reply-normalize.js'
import { TASK_CONTRACT_REQUIRED_HINT } from '../src/policy/manager/task-contract.js'

import {
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

const buildInvalidArgsRunResult = (elapsedMs: number) => ({
  ...buildRoundResult({
    output: 'invalid enqueue task',
    actions: [
      {
        type: 'enqueue_task',
        task: {
          title: 'task',
          cwd: '/tmp/task',
          mode: 'write',
          goal: 'ship',
          in_scope: ['frontend only'],
          out_of_scope: [],
          done_when: ['tests pass'],
          context_refs: [],
          instructions: [],
          provider: 'codex',
        },
      },
    ],
    threadId: 'session-manager-invalid-args',
  }),
  elapsedMs,
})

const invalidProviderFeedback = {
  action: 'enqueue_task',
  error: 'invalid_action_args',
  hint: '参数校验失败：task: Unrecognized key: "provider"',
  code: 'invalid_action_args' as const,
  repair: {
    kind: 'fix_action_args' as const,
    issues: ['task: Unrecognized key: "provider"'],
  },
}

test('runManagerCorrectionRounds explains missing execution boundary in user terms', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce(
    buildRoundResult({
      output: 'missing task contract',
      actions: [
        {
          type: 'enqueue_task',
          task: {
            title: 'task',
            cwd: '/tmp/task',
            mode: 'write',
            goal: 'ship',
            in_scope: ['frontend only'],
            out_of_scope: [],
            done_when: ['tests pass'],
            context_refs: [],
            instructions: [],
          },
        },
      ],
      threadId: 'session-manager-scope',
    }),
  )
  resolveRoundFollowupMock.mockResolvedValueOnce({
    done: false,
    extra: {
      actionFeedback: [
        {
          action: 'enqueue_task',
          error: 'action_execution_rejected',
          hint: TASK_CONTRACT_REQUIRED_HINT,
          code: 'task_contract_missing',
        },
      ],
    },
  })

  const runtime = await createCorrectionRuntime('scope')

  const result = await runCorrectionRounds({ runtime })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('继续执行前还缺最小执行边界')
  expect(result.parsed.text).toContain('目标')
  expect(result.parsed.text).toContain('处理范围')
  expect(result.parsed.text).toContain('完成标准')
  expect(result.parsed.text).toContain('执行目录与模式')
  expect(result.parsed.text).not.toContain('goal')
  expect(result.parsed.text).not.toContain('in_scope')
  expect(result.parsed.text).not.toContain('done_when')
  expect(result.parsed.text).not.toContain('cwd/mode')
})

test('runManagerCorrectionRounds returns concrete invalid action args instead of generic scope clarification', async () => {
  runManagerRoundWithRecoveryMock
    .mockResolvedValueOnce(buildInvalidArgsRunResult(3))
    .mockResolvedValueOnce(buildInvalidArgsRunResult(4))
  resolveRoundFollowupMock
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [invalidProviderFeedback],
      },
    })
    .mockResolvedValueOnce({
      done: false,
      extra: {
        actionFeedback: [invalidProviderFeedback],
      },
    })

  const runtime = await createCorrectionRuntime('invalid-args')

  const result = await runCorrectionRounds({ runtime })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('当前这轮执行单没有形成合法配置')
  expect(result.parsed.text).toContain('目标、范围、验收')
  expect(result.parsed.text).toContain('执行目录与模式')
  expect(result.parsed.text).not.toContain('provider')
  expect(result.parsed.text).not.toContain('cwd/mode')
})

test('normalizeManagerReplyText rewrites correction-style leakages into natural report language', () => {
  const reply = normalizeManagerReplyText(`继续执行前还缺最小执行边界：goal、in_scope、done_when，以及 cwd/mode。
enqueue_task 没过 intent-evidence guard，schema 还不完整。`)

  expect(reply).toContain('当前进展')
  expect(reply).toContain('下一步')
  expect(reply).not.toContain('enqueue_task')
  expect(reply).not.toContain('intent-evidence')
  expect(reply).not.toContain('schema')
  expect(reply).not.toContain('goal')
  expect(reply).not.toContain('in_scope')
  expect(reply).not.toContain('done_when')
  expect(reply).not.toContain('cwd/mode')
})
