import { beforeEach, expect, test, vi } from 'vitest'

import { runManagerRoundWithRecovery } from '../src/manager/loop-batch-exec.js'

const { runManagerMock, appendLogMock } = vi.hoisted(() => ({
  runManagerMock: vi.fn(),
  appendLogMock: vi.fn(),
}))

vi.mock('../src/manager/runner.js', () => ({
  runManager: runManagerMock,
}))

vi.mock('../src/log/append.js', () => ({
  appendLog: appendLogMock,
}))

const createRuntime = () =>
  ({
    config: {
      workDir: '/tmp/mimikit',
      manager: {
        model: 'gpt-5',
        mode: 'auto',
        promptSections: {},
      },
    },
    paths: { log: '/tmp/mimikit/log.jsonl' },
    focuses: [],
    focusContexts: [],
    activeFocusIds: [],
    managerAutoModeState: {
      firstUserInputPending: true,
    },
  }) as unknown as Parameters<typeof runManagerRoundWithRecovery>[0]['runtime']

const createParams = (
  runtime: Parameters<typeof runManagerRoundWithRecovery>[0]['runtime'],
) => ({
  runtime,
  round: 1,
  inputs: [
    {
      id: 'input-1',
      role: 'user',
      text: 'hi',
      createdAt: '2026-03-04T00:00:00.000Z',
      focusId: 'focus-global',
    },
  ],
  results: [],
  tasks: [],
  plans: [],
  workingFocusIds: ['focus-global'],
  extra: {},
})

beforeEach(() => {
  runManagerMock.mockReset()
  appendLogMock.mockReset()
  appendLogMock.mockResolvedValue(undefined)
})

test('auto first user call: chat fail then responses success and lock responses', async () => {
  const runtime = createRuntime()
  runManagerMock.mockImplementationOnce(
    async (params: { onUsage?: (usage: { input: number; output: number; total: number }) => void }) => {
      params.onUsage?.({ input: 1, output: 1, total: 2 })
      throw new Error('chat_unavailable')
    },
  )
  runManagerMock
    .mockResolvedValueOnce({
      output: 'responses-ok',
      elapsedMs: 10,
      usage: { input: 7, output: 3, total: 10 },
    })

  const result = await runManagerRoundWithRecovery(createParams(runtime))
  expect(result.output).toBe('responses-ok')
  expect(result.usage).toEqual({ input: 7, output: 3, total: 10 })
  expect(
    runManagerMock.mock.calls.map(
      (call) => (call[0] as { mode?: string }).mode,
    ),
  ).toEqual(['chat', 'responses'])
  expect(runtime.managerAutoModeState).toMatchObject({
    firstUserInputPending: false,
    lockedMode: 'responses',
  })
  expect(appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'manager_auto_first_user_chat_failed',
    }),
  )

  runManagerMock.mockReset()
  runManagerMock.mockResolvedValueOnce({
    output: 'responses-2',
    elapsedMs: 5,
  })
  const next = await runManagerRoundWithRecovery(createParams(runtime))
  expect(next.output).toBe('responses-2')
  expect(runManagerMock).toHaveBeenCalledTimes(1)
  expect(runManagerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: 'responses',
    }),
  )
})

test('auto first user call only once when chat succeeds', async () => {
  const runtime = createRuntime()
  runManagerMock.mockResolvedValue({
    output: 'chat-ok',
    elapsedMs: 8,
  })

  await runManagerRoundWithRecovery(createParams(runtime))
  await runManagerRoundWithRecovery(createParams(runtime))

  expect(
    runManagerMock.mock.calls.map(
      (call) => (call[0] as { mode?: string }).mode,
    ),
  ).toEqual(['chat', 'auto'])
  expect(runtime.managerAutoModeState).toMatchObject({
    firstUserInputPending: false,
  })
})
