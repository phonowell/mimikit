import { expect, test, vi } from 'vitest'

import { runChatCompletion } from '../src/llm/chat-completion.js'

test('runChatCompletion includes nested network cause details', async () => {
  const fetchMock = vi.fn(async () => {
    throw new TypeError('fetch failed', {
      cause: {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:443',
      },
    })
  })

  vi.stubGlobal('fetch', fetchMock)
  try {
    await expect(
      runChatCompletion({
        prompt: 'ping',
        model: 'gpt-5-mini',
        baseUrl: 'https://api.openai.com',
        timeoutMs: 200,
        errorPrefix: '[llm] OpenAI request',
      }),
    ).rejects.toThrow(
      '[llm] OpenAI request failed: fetch failed (cause: connect ECONNREFUSED 127.0.0.1:443, code=ECONNREFUSED)',
    )
  } finally {
    vi.unstubAllGlobals()
  }
})

test('runChatCompletion keeps original error text without nested cause', async () => {
  const fetchMock = vi.fn(async () => {
    throw new TypeError('fetch failed')
  })

  vi.stubGlobal('fetch', fetchMock)
  try {
    await expect(
      runChatCompletion({
        prompt: 'ping',
        model: 'gpt-5-mini',
        baseUrl: 'https://api.openai.com',
        timeoutMs: 200,
        errorPrefix: '[llm] OpenAI request',
      }),
    ).rejects.toThrow('[llm] OpenAI request failed: fetch failed')
  } finally {
    vi.unstubAllGlobals()
  }
})

test('runChatCompletion includes nested cause code without message', async () => {
  const fetchMock = vi.fn(async () => {
    throw new TypeError('fetch failed', {
      cause: { code: 'ENOTFOUND' },
    })
  })

  vi.stubGlobal('fetch', fetchMock)
  try {
    await expect(
      runChatCompletion({
        prompt: 'ping',
        model: 'gpt-5-mini',
        baseUrl: 'https://api.openai.com',
        timeoutMs: 200,
        errorPrefix: '[llm] OpenAI request',
      }),
    ).rejects.toThrow(
      '[llm] OpenAI request failed: fetch failed (cause: code=ENOTFOUND)',
    )
  } finally {
    vi.unstubAllGlobals()
  }
})
