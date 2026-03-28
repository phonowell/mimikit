import { expect, test } from 'vitest'

import { formatEnqueueTaskIntentEvidenceHint } from '../src/policy/manager/action-evidence-hints.js'

import {
  buildRoundResult,
  createCorrectionRuntime,
  resolveRoundFollowupMock,
  runCorrectionRounds,
  runManagerRoundWithRecoveryMock,
} from './manager-correction-rounds/testkit.js'

test('runManagerCorrectionRounds explains insufficient evidence for risky actions', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce(
    buildRoundResult({
      output:
        '<M:enqueue_task title="task" cwd="/tmp/task" goal="ship" in_scope="guard only" done_when_1="tests pass" />',
      actions: [
        {
          type: 'enqueue_task',
          task: {
            title: 'task',
            cwd: '/tmp/task',
            mode: 'write',
            goal: 'ship',
            in_scope: ['guard only'],
            out_of_scope: [],
            done_when: ['tests pass'],
            context_refs: [],
            instructions: [],
          },
        },
      ],
      wakeProfile: 'task_result',
      threadId: 'session-manager-evidence',
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
        },
      ],
    },
  })

  const runtime = await createCorrectionRuntime('evidence')

  const result = await runCorrectionRounds({
    runtime,
    inputs: [],
  })

  expect(result.roundLimitReached).toBe(true)
  expect(result.parsed.text).toContain('enqueue_task 动作无法继续执行')
  expect(result.parsed.text).toContain('intent-evidence guard 未通过')
  expect(result.parsed.text).toContain('task_result')
})
