import { afterEach, expect, test, vi } from 'vitest'

import { runChatCompletion } from '../src/providers/openai-chat-client.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const toSseBody = (events: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()
  const payload = events.join('\n\n')
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

test('runChatCompletion emits onUsage when stream includes usage', async () => {
  const onUsage = vi.fn()

  globalThis.fetch = vi.fn(async () => {
    const body = toSseBody([
      'data: {"choices":[{"delta":{"content":"hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}',
      'data: [DONE]',
    ])
    return new Response(body, { status: 200 }) as Response
  }) as typeof fetch

  const result = await runChatCompletion({
    prompt: 'hi',
    model: 'gpt-test',
    baseUrl: 'https://example.com',
    timeoutMs: 2_000,
    errorPrefix: '[test] openai',
    onUsage,
  })

  expect(result.output).toBe('hello world')
  expect(result.usage).toEqual({ input: 10, output: 20, total: 30 })
  expect(onUsage).toHaveBeenCalledTimes(1)
  expect(onUsage).toHaveBeenCalledWith({ input: 10, output: 20, total: 30 })
})

test('runChatCompletion de-duplicates repeated usage callbacks', async () => {
  const onUsage = vi.fn()

  globalThis.fetch = vi.fn(async () => {
    const body = toSseBody([
      'data: {"choices":[{"delta":{"content":"ok"}}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}',
      'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}',
      'data: [DONE]',
    ])
    return new Response(body, { status: 200 }) as Response
  }) as typeof fetch

  const result = await runChatCompletion({
    prompt: 'hi',
    model: 'gpt-test',
    baseUrl: 'https://example.com',
    timeoutMs: 2_000,
    errorPrefix: '[test] openai',
    onUsage,
  })

  expect(result.usage).toEqual({ input: 1, output: 2, total: 3 })
  expect(onUsage).toHaveBeenCalledTimes(1)
})
