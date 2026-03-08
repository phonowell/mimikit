import { describe, expect, test, vi } from 'vitest'

import { runCodexStream } from '@mimikit/providers/providers/codex-stream'

const toAsyncIterable = async function* (events: unknown[]) {
  for (const event of events) yield event
}

describe('runCodexStream', () => {
  test('normalizes usage and falls back to latest output text', async () => {
    const thread = {
      runStreamed: vi.fn().mockResolvedValue({
        events: toAsyncIterable([
          {
            type: 'item.updated',
            item: { type: 'agent_message', text: 'hel' },
          },
          {
            type: 'item.updated',
            item: { type: 'agent_message', text: 'hello' },
          },
          {
            type: 'turn.completed',
            usage: {
              input_tokens: 120,
              output_tokens: 30,
              total_tokens: 150,
              input_tokens_details: {
                cached_tokens: 40,
                cache_creation_tokens: 8,
              },
              output_tokens_details: {
                cached_tokens: 4,
              },
              session_total_tokens: 999,
            },
          },
        ]),
      }),
      id: 'thread-test',
    }
    const onUsage = vi.fn()
    const onPartialOutput = vi.fn()
    const request = {
      provider: 'codex-sdk' as const,
      role: 'manager' as const,
      prompt: 'ping',
      workDir: '/tmp/mimikit',
      timeoutMs: 60_000,
      onUsage,
      onPartialOutput,
    }
    const resetIdle = vi.fn()
    const signal = new AbortController().signal

    const result = await runCodexStream(thread, request, signal, resetIdle)

    expect(result.output).toBe('hello')
    expect(result.usage).toEqual({
      input: 120,
      output: 30,
      inputCacheRead: 40,
      inputCacheWrite: 8,
      outputCache: 4,
      total: 150,
      sessionTotal: 999,
    })
    expect(onUsage).toHaveBeenCalledWith(result.usage)
    expect(onPartialOutput).toHaveBeenCalledTimes(2)
    expect(onPartialOutput).toHaveBeenNthCalledWith(1, 'hel')
    expect(onPartialOutput).toHaveBeenNthCalledWith(2, 'hello')
  })

  test('throws message from turn.failed event', async () => {
    const thread = {
      runStreamed: vi.fn().mockResolvedValue({
        events: toAsyncIterable([
          {
            type: 'turn.failed',
            error: { message: 'responses_failed' },
          },
        ]),
      }),
      id: 'thread-test',
    }
    const request = {
      provider: 'codex-sdk' as const,
      role: 'manager' as const,
      prompt: 'ping',
      workDir: '/tmp/mimikit',
      timeoutMs: 60_000,
    }
    const signal = new AbortController().signal
    const resetIdle = vi.fn()

    await expect(
      runCodexStream(thread, request, signal, resetIdle),
    ).rejects.toThrow('responses_failed')
  })
})
