import { beforeEach, expect, test, vi } from 'vitest'

const hoistedMocks = vi.hoisted(() => ({
  appendLogMock: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('../src/persistence/log/append.js', () => ({
  appendLog: hoistedMocks.appendLogMock,
}))

const { appendOpenAiResponsesLog } =
  await import('../src/execution/providers/openai-responses-provider-log.js')
const { appendCodexLlmLog } =
  await import('../src/execution/providers/codex-sdk-provider-helpers.js')

beforeEach(() => {
  hoistedMocks.appendLogMock.mockClear()
})

test('openai responses provider log uses shared diagnostics logger', async () => {
  await appendOpenAiResponsesLog(
    {
      prompt: 'manager prompt',
      role: 'manager',
      timeoutMs: 60_000,
      workDir: '/tmp/mimikit',
      logPath: '/tmp/mimikit/log.jsonl',
      logContext: {
        event: 'llm_call',
        batchId: 'batch-1',
        roundId: 'round-1',
        providerCallId: 'call-1',
      },
    } as never,
    { event: 'llm_call_started' },
  )

  expect(hoistedMocks.appendLogMock).toHaveBeenCalledWith(
    '/tmp/mimikit/log.jsonl',
    expect.objectContaining({
      event: 'llm_call_started',
      batchId: 'batch-1',
      roundId: 'round-1',
      providerCallId: 'call-1',
    }),
  )
})

test('codex provider log uses shared diagnostics logger', async () => {
  await appendCodexLlmLog(
    {
      prompt: 'worker prompt',
      role: 'worker',
      timeoutMs: 60_000,
      workDir: '/tmp/mimikit',
      logPath: '/tmp/mimikit/log.jsonl',
      logContext: {
        event: 'llm_call',
        taskId: 'task-1',
        providerCallId: 'call-2',
        attempt: 2,
      },
    } as never,
    { event: 'llm_call_failed', error: 'boom' },
  )

  expect(hoistedMocks.appendLogMock).toHaveBeenCalledWith(
    '/tmp/mimikit/log.jsonl',
    expect.objectContaining({
      event: 'llm_call_failed',
      taskId: 'task-1',
      providerCallId: 'call-2',
      attempt: 2,
      error: 'boom',
    }),
  )
})
