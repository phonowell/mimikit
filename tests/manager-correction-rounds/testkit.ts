import { beforeEach, vi } from 'vitest'

import { runManagerCorrectionRounds } from '../../src/policy/manager/loop-batch-run-rounds.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type {
  FocusId,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../../src/foundation/types/index.js'
import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

const hoistedMocks = vi.hoisted(() => ({
  appendLogMock: vi.fn(() => Promise.resolve(undefined)),
  resolveRoundFollowupMock: vi.fn(),
  runManagerRoundWithRecoveryMock: vi.fn(),
}))

export const {
  appendLogMock,
  resolveRoundFollowupMock,
  runManagerRoundWithRecoveryMock,
} = hoistedMocks

vi.mock('../../src/persistence/log/append.js', () => ({
  appendLog: hoistedMocks.appendLogMock,
}))

vi.mock('../../src/policy/manager/loop-batch-exec.js', () => ({
  runManagerRoundWithRecovery: hoistedMocks.runManagerRoundWithRecoveryMock,
}))

vi.mock('../../src/policy/manager/loop-batch-round-followup.js', () => ({
  resolveRoundFollowup: hoistedMocks.resolveRoundFollowupMock,
}))

export const resetCorrectionRoundMocks = (): void => {
  runManagerRoundWithRecoveryMock.mockReset()
  resolveRoundFollowupMock.mockReset()
  appendLogMock.mockClear()
}

beforeEach(() => {
  resetCorrectionRoundMocks()
})

export const buildCorrectionInput = (
  overrides: Partial<UserInput> = {},
): UserInput => ({
  id: 'input-correction-1',
  role: 'user',
  text: '继续处理',
  createdAt: '2026-03-08T00:00:00.000Z',
  focusId: 'focus-global',
  ...overrides,
})

export const buildRoundResult = (overrides: {
  output: string
  actions?: Array<Record<string, unknown>>
  elapsedMs?: number
  wakeProfile?: 'user_input' | 'task_result'
  threadId: string
  usage?: Record<string, number>
}) => ({
  actions: [],
  elapsedMs: 3,
  wakeProfile: 'user_input' as const,
  ...overrides,
})

export const createCorrectionRuntime = (name: string): Promise<RuntimeState> =>
  createTestRuntimeState({
    workDir: `/tmp/mimikit-manager-correction-${name}-test`,
    withGlobalFocus: false,
  })

export const runCorrectionRounds = (params: {
  runtime: RuntimeState
  inputs?: UserInput[]
  results?: TaskResult[]
  tasks?: Task[]
  plans?: TaskPlan[]
  workingFocusIds?: FocusId[]
  maxCorrectionRounds?: number
}): Promise<Awaited<ReturnType<typeof runManagerCorrectionRounds>>> =>
  runManagerCorrectionRounds({
    runtime: params.runtime,
    inputs: params.inputs ?? [buildCorrectionInput()],
    results: params.results ?? [],
    tasks: params.tasks ?? [],
    plans: params.plans ?? [],
    workingFocusIds: params.workingFocusIds ?? ['focus-global'],
    maxCorrectionRounds: params.maxCorrectionRounds ?? 3,
  })
