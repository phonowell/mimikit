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
