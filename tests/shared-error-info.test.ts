import { describe, expect, it } from 'vitest'

import { toErrorInfo } from '../src/shared/error-info.js'

describe('toErrorInfo', () => {
  it('returns message, name, and trimmed stack for Error instances', () => {
    const error = new Error('boom')
    error.name = 'ExplodedError'
    error.stack = ['ExplodedError: boom', 'a', 'b', 'c', 'd', 'e', 'f'].join(
      '\n',
    )

    expect(toErrorInfo(error, 3)).toEqual({
      message: 'boom',
      name: 'ExplodedError',
      stack: ['ExplodedError: boom', 'a', 'b'].join('\n'),
    })
  })

  it('stringifies non-Error values without stack fields', () => {
    expect(toErrorInfo({ code: 1 })).toEqual({ message: '[object Object]' })
  })
})
