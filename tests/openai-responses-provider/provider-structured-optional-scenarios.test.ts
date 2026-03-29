import { describe, expect, test, vi } from 'vitest'

import { openAiResponsesProvider } from '../../src/execution/providers/openai-responses-provider.js'

import { createHomeDir, trackHomeDir, writeCodexConfig } from './testkit.js'

describe('openAiResponsesProvider optional structured fields', () => {
  test('normalizes optional object properties into required nullable fields', async () => {
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
            text: JSON.stringify({ ok: true }),
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
                      text: JSON.stringify({ ok: true }),
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

    await openAiResponsesProvider.run({
      provider: 'openai-responses',
      role: 'manager',
      prompt: 'ping',
      workDir: process.cwd(),
      timeoutMs: 30_000,
      model: 'gpt-5',
      outputSchema: {
        type: 'json_schema',
        name: 'optional_fields',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            payload: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                instructions: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
          required: ['ok'],
          additionalProperties: false,
        },
      },
    })

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const firstBody = JSON.parse(String(firstInit.body))
    const payloadSchema = (
      (
        firstBody.text.format.schema.properties.payload as {
          anyOf?: Array<{
            type?: string
            properties?: Record<string, unknown>
            required?: string[]
          }>
        }
      ).anyOf ?? []
    ).find((branch) => branch.type === 'object')

    expect(payloadSchema?.required).toEqual(['name', 'instructions'])
    expect(payloadSchema?.properties?.instructions).toEqual({
      anyOf: [
        {
          type: 'array',
          items: { type: 'string' },
        },
        { type: 'null' },
      ],
    })
  })
})
