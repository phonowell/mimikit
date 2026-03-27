import { describe, expect, test, vi } from 'vitest'

import { openAiResponsesProvider } from '../../src/execution/providers/openai-responses-provider.js'

import { createHomeDir, trackHomeDir, writeCodexConfig } from './testkit.js'

describe('openAiResponsesProvider structured output', () => {
  test('streams structured output format and parses structured json payload', async () => {
    const homeDir = await createHomeDir()
    trackHomeDir(homeDir)
    await writeCodexConfig(homeDir)
    process.env.HOME = homeDir
    process.env.AICODING_API_KEY = 'provider-env-key'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        [
          'event: response.output_text.done',
          `data: ${JSON.stringify({
            type: 'response.output_text.done',
            text: JSON.stringify({
              reply: 'structured-ok',
              actions: [],
            }),
          })}`,
          '',
          'event: response.completed',
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              output: [
                {
                  type: 'message',
                  content: [
                    {
                      type: 'output_text',
                      text: JSON.stringify({
                        reply: 'structured-ok',
                        actions: [],
                      }),
                    },
                  ],
                },
              ],
              usage: {
                input_tokens: 5,
                output_tokens: 3,
                total_tokens: 8,
              },
            },
          })}`,
          '',
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
    )
    globalThis.fetch = fetchMock

    const outputSchema = {
      type: 'json_schema',
      name: 'manager_turn',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
          actions: {
            type: 'array',
            items: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', const: 'noop' },
                  },
                  required: ['type'],
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  properties: {
                    type: { type: 'string', const: 'noop-2' },
                  },
                  required: ['type'],
                  additionalProperties: false,
                },
              ],
            },
          },
        },
        required: ['reply', 'actions'],
        additionalProperties: false,
      },
    }

    const result = await openAiResponsesProvider.run({
      provider: 'openai-responses',
      role: 'manager',
      prompt: 'ping',
      workDir: process.cwd(),
      timeoutMs: 30_000,
      model: 'gpt-5',
      outputSchema,
    })

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const firstBody = JSON.parse(String(firstInit.body))
    expect(firstBody.stream).toBe(true)
    expect(firstBody.text.format.schema.properties.actions.items).toEqual(
      expect.objectContaining({
        anyOf: expect.any(Array),
      }),
    )
    expect(
      firstBody.text.format.schema.properties.actions.items,
    ).not.toHaveProperty('oneOf')
    expect(result.outputJson).toEqual({
      reply: 'structured-ok',
      actions: [],
    })
  })
})
