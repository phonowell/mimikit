import { expect, test } from 'vitest'

import {
  buildProviderSdkError,
  isTransientProviderMessage,
  readProviderErrorCode,
} from '../src/providers/provider-error.js'

test('buildProviderSdkError marks reconnecting stream disconnect as transient', () => {
  const message = 'Reconnecting... 1/5 (stream disconnected, waiting 174ms)'

  const error = buildProviderSdkError({
    providerId: 'codex-sdk',
    message,
    transient: isTransientProviderMessage(message),
  })

  expect(readProviderErrorCode(error)).toBe('provider_transient_network')
  expect(error.retryable).toBe(true)
  expect(error.message).toContain(message)
})

test('buildProviderSdkError keeps schema failures non-retryable', () => {
  const message = 'invalid schema'

  const error = buildProviderSdkError({
    providerId: 'codex-sdk',
    message,
    transient: isTransientProviderMessage(message),
  })

  expect(readProviderErrorCode(error)).toBe('provider_sdk_failure')
  expect(error.retryable).toBe(false)
})
