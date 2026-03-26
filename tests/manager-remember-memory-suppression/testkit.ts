import { vi } from 'vitest'

import { appendHistory } from '../../src/persistence/history/store.js'
import { runManagerCorrectionRounds } from '../../src/policy/manager/loop-batch-run-rounds.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

export const rememberMemoryContent =
  'Always keep replies concise and in Chinese.'

const { runManagerRoundWithRecoveryMock } = vi.hoisted(() => ({
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

vi.mock('../../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: runManagerRoundWithRecoveryMock,
}))

export const resetRememberMemoryMocks = (): void => {
  runManagerRoundWithRecoveryMock.mockReset()
}

export const mockRememberMemoryRound = (
  output: string,
  threadId: string,
): void => {
  runManagerRoundWithRecoveryMock.mockResolvedValueOnce({
    output,
    elapsedMs: 3,
    wakeProfile: 'user_input',
    threadId,
  })
}

export const createRememberMemoryRuntime = (
  workDir: string,
): Promise<RuntimeState> =>
  createTestRuntimeState({
    workDir,
  })

export const runRememberMemoryRound = (
  runtime: RuntimeState,
  userText: string,
  maxCorrectionRounds = 3,
): Promise<Awaited<ReturnType<typeof runManagerCorrectionRounds>>> =>
  runManagerCorrectionRounds({
    runtime,
    inputs: [
      {
        id: 'input-user',
        role: 'user',
        text: userText,
        createdAt: '2026-03-26T07:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
    results: [],
    tasks: [],
    plans: [],
    workingFocusIds: ['focus-global'],
    maxCorrectionRounds,
  })

export const appendRepeatedRememberMemoryHistory = async (
  runtime: RuntimeState,
): Promise<void> => {
  await appendHistory(runtime.paths.history, {
    id: 'input-history-1',
    role: 'user',
    text: rememberMemoryContent,
    createdAt: '2026-03-25T07:00:00.000Z',
    focusId: 'focus-global',
  })
  await appendHistory(runtime.paths.history, {
    id: 'input-history-2',
    role: 'user',
    text: rememberMemoryContent,
    createdAt: '2026-03-25T07:05:00.000Z',
    focusId: 'focus-global',
  })
}
