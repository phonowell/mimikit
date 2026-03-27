import { describe, expect, test, vi } from 'vitest'

import { runCodexStream } from '../src/execution/providers/codex-stream.js'

import type { CodexSdkProviderRequest } from '../src/execution/providers/types.js'

const createRequest = (outputSchema?: unknown): CodexSdkProviderRequest => ({
  provider: 'codex-sdk',
  role: 'worker',
  prompt: 'ping',
  workDir: process.cwd(),
  timeoutMs: 30_000,
  ...(outputSchema ? { outputSchema } : {}),
})

describe('runCodexStream output schema forwarding', () => {
  test('unwraps json_schema wrappers before calling codex sdk', async () => {
    const runStreamed = vi.fn().mockResolvedValue({
      events: (async function* () {
        yield {
          type: 'item.completed',
          item: {
            type: 'agent_message',
            text: '{"reply":"ok","handoff":{"summary":"done"}}',
          },
        }
        yield {
          type: 'turn.completed',
          usage: { input_tokens: 2, output_tokens: 1, cached_input_tokens: 0 },
        }
      })(),
    })
    const request = createRequest({
      type: 'json_schema',
      name: 'worker_turn',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
          handoff: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
            },
            required: ['summary'],
            additionalProperties: false,
          },
        },
        required: ['reply', 'handoff'],
        additionalProperties: false,
      },
    })

    const result = await runCodexStream(
      { runStreamed },
      request,
      new AbortController().signal,
      () => undefined,
    )

    expect(runStreamed).toHaveBeenCalledWith(
      'ping',
      expect.objectContaining({
        outputSchema: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            handoff: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
              },
              required: ['summary'],
              additionalProperties: false,
            },
          },
          required: ['reply', 'handoff'],
          additionalProperties: false,
        },
      }),
    )
    expect(result.output).toBe('{"reply":"ok","handoff":{"summary":"done"}}')
    expect(result.usage).toEqual({
      input: 2,
      output: 1,
      inputCacheRead: 0,
      total: 3,
    })
  })
})
