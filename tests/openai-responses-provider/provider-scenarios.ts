import { describe, expect, test, vi } from 'vitest'

import { readProviderErrorCode } from '../../src/execution/providers/provider-error.js'
import { openAiResponsesProvider } from '../../src/execution/providers/openai-responses-provider.js'

import {
  createHomeDir,
  trackHomeDir,
  writeCodexConfig,
} from './testkit.js'

describe('openAiResponsesProvider', () => {
  test('maps cancelled fetch errors to provider_aborted', async () => {
    const homeDir = await createHomeDir()
    trackHomeDir(homeDir)
    await writeCodexConfig(homeDir)
    process.env.HOME = homeDir
    process.env.AICODING_API_KEY = 'provider-env-key'

    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('request cancelled by user'))

    const error = await openAiResponsesProvider
      .run({
        provider: 'openai-responses',
        role: 'manager',
        prompt: 'ping',
        workDir: process.cwd(),
        timeoutMs: 30_000,
        model: 'gpt-5',
      })
      .catch((rejected: unknown) => rejected)

    expect(error).toMatchObject({
      message: '[provider:openai-responses] aborted',
    })
    expect(readProviderErrorCode(error)).toBe('provider_aborted')
  })

  test('prefers request-level baseUrl and apiKey overrides for manager calls', async () => {
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
              content: [{ type: 'output_text', text: 'override-ok' }],
            },
          ],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    globalThis.fetch = fetchMock

    const result = await openAiResponsesProvider.run({
      provider: 'openai-responses',
      role: 'manager',
      prompt: 'ping',
      workDir: process.cwd(),
      timeoutMs: 30_000,
      model: 'gpt-5',
      baseUrl: ' http://localhost:18080/v1/codex/ ',
      apiKey: ' manager-config-key ',
    })

    expect(result.output).toBe('override-ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:18080/v1/codex/responses')
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((firstInit.headers as Record<string, string>).authorization).toBe(
      'Bearer manager-config-key',
    )
  })

  test('always sends session_id header, stream=true and reasoning effort for manager calls', async () => {
    const homeDir = await createHomeDir()
    trackHomeDir(homeDir)
    await writeCodexConfig(homeDir)
    process.env.HOME = homeDir
    process.env.AICODING_API_KEY = 'provider-env-key'

    const sse = [
      'event: response.completed',
      'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"42"}]}],"usage":{"input_tokens":6,"output_tokens":1,"total_tokens":7}}}',
      '',
    ].join('\n')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    globalThis.fetch = fetchMock

    const result = await openAiResponsesProvider.run({
      provider: 'openai-responses',
      role: 'manager',
      prompt: '计算 21 * 2。只输出数字。',
      workDir: process.cwd(),
      timeoutMs: 30_000,
      model: 'gpt-5',
      modelReasoningEffort: 'high',
    })

    expect(result.output).toBe('42')
    expect(result.usage).toEqual({
      input: 6,
      output: 1,
      total: 7,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const firstBody = JSON.parse(String(firstInit.body))
    expect((firstInit.headers as Record<string, string>).session_id).toMatch(
      /^session-/,
    )
    expect(firstBody.stream).toBe(true)
    expect(firstBody.reasoning).toEqual({ effort: 'high' })
    expect(result.threadId).toMatch(/^session-/)
  })

  test('encodes prompt segments without cache control in responses input', async () => {
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
              content: [{ type: 'output_text', text: 'ok' }],
            },
          ],
          usage: {
            input_tokens: 5,
            output_tokens: 2,
            total_tokens: 7,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    globalThis.fetch = fetchMock

    await openAiResponsesProvider.run({
      provider: 'openai-responses',
      role: 'manager',
      prompt: 'fallback prompt',
      promptSegments: [
        { text: 'stable prefix', cacheControl: 'ephemeral' },
        { text: 'variable suffix' },
      ],
      workDir: process.cwd(),
      timeoutMs: 30_000,
      model: 'gpt-5',
    })

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as { input?: Array<{ content?: Array<Record<string, unknown>> }> }
    const firstPart = body.input?.[0]?.content?.[0]
    const secondPart = body.input?.[1]?.content?.[0]
    expect(firstPart).toMatchObject({
      type: 'input_text',
      text: 'stable prefix',
    })
    expect(secondPart).toMatchObject({
      type: 'input_text',
      text: 'variable suffix',
    })
    expect(firstPart).not.toHaveProperty('cache_control')
    expect(secondPart).not.toHaveProperty('cache_control')
  })
})
