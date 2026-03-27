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
              decisions: {
                type: 'array',
                items: { type: 'string' },
              },
              artifacts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    kind: { type: 'string' },
                    note: { type: 'string' },
                  },
                  required: ['path'],
                  additionalProperties: false,
                },
              },
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

    expect(runStreamed.mock.calls[0]?.[0]).toBe('ping')
    const forwardedSchema = runStreamed.mock.calls[0]?.[1]?.outputSchema as {
      properties?: Record<string, unknown>
      required?: string[]
    }
    expect(forwardedSchema.required).toEqual(['reply', 'handoff'])
    expect(forwardedSchema.properties?.reply).toEqual({ type: 'string' })
    expect(forwardedSchema.properties?.handoff).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['summary', 'decisions', 'artifacts'],
        additionalProperties: false,
      }),
    )
    expect(
      (
        forwardedSchema.properties?.handoff as {
          properties?: Record<string, unknown>
        }
      ).properties?.artifacts,
    ).toEqual(
      expect.objectContaining({
        anyOf: expect.arrayContaining([
          expect.objectContaining({
            items: expect.objectContaining({
              required: ['path', 'kind', 'note'],
            }),
          }),
        ]),
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

  test('emits command execution activity as partial output before final agent message', async () => {
    const partialOutputs: string[] = []
    const runStreamed = vi.fn().mockResolvedValue({
      events: (async function* () {
        yield {
          type: 'item.completed',
          item: {
            id: 'cmd-1',
            type: 'command_execution',
            command: 'sleep 2 && echo done',
            aggregated_output: 'done\n',
            status: 'completed',
            exit_code: 0,
          },
        }
        yield {
          type: 'item.completed',
          item: {
            type: 'agent_message',
            id: 'agent-1',
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
      type: 'object',
      additionalProperties: false,
      properties: {
        reply: { type: 'string' },
        handoff: {
          type: 'object',
          additionalProperties: false,
          properties: { summary: { type: 'string' } },
          required: ['summary'],
        },
      },
      required: ['reply', 'handoff'],
    })

    const result = await runCodexStream(
      { runStreamed },
      {
        ...request,
        onPartialOutput: (output) => {
          partialOutputs.push(output)
        },
      },
      new AbortController().signal,
      () => undefined,
    )

    expect(partialOutputs).toEqual(
      expect.arrayContaining([expect.stringContaining('sleep 2 && echo done')]),
    )
    expect(result.output).toBe('{"reply":"ok","handoff":{"summary":"done"}}')
  })
})
