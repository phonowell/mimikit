import { describe, expect, it } from 'vitest'

import { readProviderErrorCode } from '../../src/providers/provider-error.js'

describe('providers package smoke', () => {
  it('exports provider error helpers', () => {
    const code = readProviderErrorCode(
      Object.assign(new Error('x'), { code: 'provider_sdk_failure' }),
    )
    expect(code).toBe('provider_sdk_failure')
  })
})
