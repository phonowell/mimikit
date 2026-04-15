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

const expectUserVisibleManagerReply = (
  reply: string,
  forbiddenFragments: string[],
): void => {
  expect(reply.trim().length).toBeGreaterThan(0)
  expect(reply).not.toContain('<M:')
  for (const fragment of forbiddenFragments)
    expect(reply).not.toContain(fragment)
}

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
  expectUserVisibleManagerReply(result.parsed.text, [
    'goal',
    'in_scope',
    'done_when',
    'cwd/mode',
  ])
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
  expectUserVisibleManagerReply(result.parsed.text, ['provider', 'cwd/mode'])
})

test('normalizeManagerReplyText rewrites correction-style leakages into natural report language', () => {
  const reply = normalizeManagerReplyText(
    [
      '继续执行前还缺最小执行边界：goal、in_scope、done_when，以及 cwd/mode。',
      'enqueue_task 没过 intent-evidence guard，schema 还不完整。',
    ].join('\n'),
  )

  expectUserVisibleManagerReply(reply, [
    'enqueue_task',
    'intent-evidence',
    'schema',
    'goal',
    'in_scope',
    'done_when',
    'cwd/mode',
  ])
  expect(reply).toContain('下一步')
})
