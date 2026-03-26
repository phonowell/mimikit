import { describe, expect, test, vi } from 'vitest'

import { openAiResponsesProvider } from '../../src/execution/providers/openai-responses-provider.js'

import {
  createHomeDir,
  trackHomeDir,
  writeCodexConfig,
} from './testkit.js'

describe('openAiResponsesProvider structured output', () => {
  test('sends structured output format and parses structured json payload', async () => {
    const homeDir = await createHomeDir()
    trackHomeDir(homeDir)
    await writeCodexConfig(homeDir)
    process.env.HOME = homeDir
    process.env.AICODING_API_KEY = 'provider-env-key'

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    reply_text: 'structured-ok',
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
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
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
          reply_text: { type: 'string' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
              },
              required: ['type'],
              additionalProperties: false,
            },
          },
        },
        required: ['reply_text', 'actions'],
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
    expect(firstBody.stream).toBe(false)
    expect(firstBody.text).toEqual({
      format: outputSchema,
    })
    expect(result.outputJson).toEqual({
      reply_text: 'structured-ok',
      actions: [],
    })
  })
})
