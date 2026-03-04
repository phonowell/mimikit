import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  openAiResponsesProvider,
  parseResponsesPayload,
  parseResponsesSse,
} from '../src/providers/openai-responses-provider.js'

const ENV_KEYS = ['HOME', 'USERPROFILE', 'OPENAI_API_KEY', 'AICODING_API_KEY'] as const
type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string>>

const createHomeDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'mimikit-openai-responses-provider-'))

const writeCodexConfig = async (homeDir: string): Promise<void> => {
  const codexDir = join(homeDir, '.codex')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    join(codexDir, 'config.toml'),
    [
      'model_provider = "aicoding"',
      '',
      '[model_providers.aicoding]',
      'base_url = "https://your-codex-provider.example.com/v1/codex"',
      'wire_api = "responses"',
      'env_key = "AICODING_API_KEY"',
      '',
    ].join('\n'),
    'utf8',
  )
}

let envSnapshot: EnvSnapshot = {}
const createdHomeDirs: string[] = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  envSnapshot = {}
  for (const key of ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) envSnapshot[key] = value
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  for (const key of ENV_KEYS) {
    const value = envSnapshot[key]
    if (value !== undefined) process.env[key] = value
  }
  globalThis.fetch = originalFetch
})

afterEach(async () => {
  await Promise.all(
    createdHomeDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true })
    }),
  )
})

describe('parseResponsesSse', () => {
  test('extracts output and usage from response.completed event', () => {
    const sse = [
      'event: response.created',
      'data: {"type":"response.created"}',
      '',
      'event: response.output_text.done',
      'data: {"type":"response.output_text.done","text":"fallback"}',
      '',
      'event: response.completed',
      'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"hello"}]}],"usage":{"input_tokens":10,"output_tokens":3,"total_tokens":13,"input_tokens_details":{"cached_tokens":2}}}}',
      '',
    ].join('\n')

    const parsed = parseResponsesSse(sse)

    expect(parsed.output).toBe('hello')
    expect(parsed.usage).toEqual({
      input: 10,
      output: 3,
      total: 13,
      inputCacheRead: 2,
    })
  })

  test('throws failed message from response.failed event', () => {
    const sse = [
      'event: response.failed',
      'data: {"type":"response.failed","response":{"error":{"message":"upstream failed"}}}',
      '',
    ].join('\n')

    expect(() => parseResponsesSse(sse)).toThrow('upstream failed')
  })
})

describe('parseResponsesPayload', () => {
  test('extracts output and usage from json response payload', () => {
    const payload = JSON.stringify({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'json-ok' }],
        },
      ],
      usage: {
        input_tokens: 8,
        output_tokens: 4,
        total_tokens: 12,
      },
    })

    const parsed = parseResponsesPayload(payload)

    expect(parsed.output).toBe('json-ok')
    expect(parsed.usage).toEqual({
      input: 8,
      output: 4,
      total: 12,
    })
  })
})

describe('openAiResponsesProvider', () => {
  test('prefers request-level baseUrl and apiKey overrides for manager calls', async () => {
    const homeDir = await createHomeDir()
    createdHomeDirs.push(homeDir)
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

  test('retries once with session_id header when upstream requires session_id', async () => {
    const homeDir = await createHomeDir()
    createdHomeDirs.push(homeDir)
    await writeCodexConfig(homeDir)
    process.env.HOME = homeDir
    process.env.AICODING_API_KEY = 'provider-env-key'

    const sse = [
      'event: response.completed',
      'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"42"}]}],"usage":{"input_tokens":6,"output_tokens":1,"total_tokens":7}}}',
      '',
    ].join('\n')
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: -400,
            message: '请求参数错误 缺失session_id',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
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
    })

    expect(result.output).toBe('42')
    expect(result.usage).toEqual({
      input: 6,
      output: 1,
      total: 7,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    const firstBody = JSON.parse(String(firstInit.body))
    const secondBody = JSON.parse(String(secondInit.body))
    expect((firstInit.headers as Record<string, string>).session_id).toBeUndefined()
    expect((secondInit.headers as Record<string, string>).accept).toBeUndefined()
    expect((secondInit.headers as Record<string, string>).session_id).toMatch(
      /^session-/,
    )
    expect(firstBody.stream).toBe(false)
    expect(secondBody.stream).toBe(false)
    expect(result.threadId).toMatch(/^session-/)
  })
})
