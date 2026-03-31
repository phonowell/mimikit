import { expect, test, vi } from 'vitest'

import { openAiResponsesProvider } from '../../src/execution/providers/openai-responses-provider.js'
import { readProviderErrorCode } from '../../src/execution/providers/provider-error.js'

import { createHomeDir, trackHomeDir, writeCodexConfig } from './testkit.js'

test('treats invalid api key 401 from responses endpoint as retryable transient failure', async () => {
  const homeDir = await createHomeDir()
  trackHomeDir(homeDir)
  await writeCodexConfig(homeDir)
  process.env.HOME = homeDir
  process.env.AICODING_API_KEY = 'provider-env-key'

  globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  )

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
    retryable: true,
  })
  expect(String((error as Error).message)).toContain('Invalid API key')
  expect(readProviderErrorCode(error)).toBe('provider_transient_network')
})

test('treats missing responses completed event as retryable transient failure', async () => {
  const homeDir = await createHomeDir()
  trackHomeDir(homeDir)
  await writeCodexConfig(homeDir)
  process.env.HOME = homeDir
  process.env.AICODING_API_KEY = 'provider-env-key'

  const incompleteSse = [
    'event: response.output_text.done',
    'data: {"type":"response.output_text.done","text":"partial"}',
    '',
  ].join('\n')

  globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(incompleteSse, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  )

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
    retryable: true,
  })
  expect(String((error as Error).message)).toContain(
    'responses_completed_event_missing',
  )
  expect(readProviderErrorCode(error)).toBe('provider_transient_network')
})
