import { expect, test } from 'vitest'

import { validatePromptCandidate } from '../src/evolve/prompt-guard.js'

const validOriginal = [
  '你是对话助手',
  '<MIMIKIT:commands>',
  '@add_task prompt="x" title="y"',
  '@cancel_task id="z"',
  '</MIMIKIT:commands>',
].join('\n')

test('accepts valid candidate', () => {
  const candidate = `${validOriginal}\n输出格式：先自然回复。`
  const result = validatePromptCandidate(validOriginal, candidate)
  expect(result.ok).toBe(true)
  expect(result.reason).toBe('ok')
})

test('rejects missing markers', () => {
  const candidate = '你是助手\n@add_task'
  const result = validatePromptCandidate(validOriginal, candidate)
  expect(result.ok).toBe(false)
  expect(result.reason.startsWith('missing_marker:')).toBe(true)
})

test('rejects extreme length changes', () => {
  const tooShort = validatePromptCandidate(validOriginal, 'x')
  expect(tooShort.ok).toBe(false)

  const tooLong = validatePromptCandidate(validOriginal, validOriginal.repeat(5))
  expect(tooLong.ok).toBe(false)
})
