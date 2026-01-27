import { describe, expect, it } from 'vitest'

import { parseAskArgs } from '../src/cli/args.js'

describe('parseAskArgs', () => {
  it('defaults session and uses positional message', () => {
    const result = parseAskArgs(['hello', 'world'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionKey).toBe('default')
    expect(result.value.message).toBe('hello world')
  })

  it('uses --session when provided', () => {
    const result = parseAskArgs(['--session', 's1', 'ping'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionKey).toBe('s1')
    expect(result.value.message).toBe('ping')
  })

  it('uses --message when provided', () => {
    const result = parseAskArgs(['--message', 'ping'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionKey).toBe('default')
    expect(result.value.message).toBe('ping')
  })

  it('returns error when message missing', () => {
    const result = parseAskArgs(['--session', 's1'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('--message')
  })

  it('parses verify and max-iterations flags', () => {
    const result = parseAskArgs([
      '--verify',
      'pnpm test',
      '--max-iterations',
      '3',
      'ping',
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.verifyCommand).toBe('pnpm test')
    expect(result.value.maxIterations).toBe(3)
  })
})
