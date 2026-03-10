import { expect, test } from 'vitest'

import { buildCodexProviderError } from '../src/providers/codex-sdk-provider-helpers.js'
import { readProviderErrorCode } from '../src/providers/provider-error.js'
import { isAbortLikeError } from '../src/worker/error-utils.js'

test('buildCodexProviderError maps cancelled messages to provider_aborted', () => {
  const error = buildCodexProviderError({
    error: new Error('request cancelled by user'),
    timeoutMs: 30_000,
    timedOut: false,
    externallyAborted: false,
  })

  expect(readProviderErrorCode(error)).toBe('provider_aborted')
  expect(error.retryable).toBe(false)
})

test('isAbortLikeError treats cancelled spelling as abort-like', () => {
  expect(isAbortLikeError(new Error('request cancelled by user'))).toBe(true)
})
