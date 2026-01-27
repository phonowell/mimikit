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

  it('parses score and guard flags', () => {
    const result = parseAskArgs([
      '--score',
      'echo 42',
      '--min-score',
      '40',
      '--objective',
      'quality',
      '--guard-clean',
      '--guard-max-files',
      '2',
      '--guard-max-lines',
      '10',
      'ping',
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scoreCommand).toBe('echo 42')
    expect(result.value.minScore).toBe(40)
    expect(result.value.objective).toBe('quality')
    expect(result.value.guardRequireClean).toBe(true)
    expect(result.value.guardMaxChangedFiles).toBe(2)
    expect(result.value.guardMaxChangedLines).toBe(10)
  })
})
