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

test('runManagerCorrectionRounds explains insufficient evidence for risky actions', async () => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output:
      '<M:enqueue_task title="task" cwd="/tmp/task" goal="ship" in_scope="guard only" done_when_1="tests pass" />',
    elapsedMs: 3,
    promptPrefixHash: 'prefix-hash',
    threadId: 'session-manager-evidence',
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
        },
      ],
    },
  })

  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-manager-thread-cache-evidence-test',
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
  expect(result.parsed.text).toContain('缺少可核实证据')
  expect(result.parsed.text).toContain('直接向用户确认')
})
