import { expect, test } from 'vitest'

import {
  MAX_SPEAK_CHARS,
  fallbackMarkdownToSpeakText,
  resolveLatestSpeakText,
  toSpeakText,
} from '../webui/tts-text.js'

test('fallbackMarkdownToSpeakText normalizes markdown syntax into readable text', () => {
  const source = [
    '**Bold** and [Link](https://example.com)',
    '- Item one',
    '1. Item two',
    '```ts',
    'const x = 1',
    '```',
    '`inline`',
  ].join('\n')

  expect(fallbackMarkdownToSpeakText(source)).toBe(
    'Bold and Link Item one Item two const x = 1 inline',
  )
})

test('toSpeakText truncates over MAX_SPEAK_CHARS', () => {
  const source = `# ${'a'.repeat(MAX_SPEAK_CHARS + 32)}`
  const text = toSpeakText(source)
  expect(text.length).toBe(MAX_SPEAK_CHARS + 3)
  expect(text.endsWith('...')).toBe(true)
})

test('resolveLatestSpeakText uses newest speakable message', () => {
  const messages = [
    { id: 'msg-1', text: '**first**' },
    { id: 'msg-2', text: '' },
    { id: 'msg-3', text: '[latest](https://example.com)' },
  ]
  expect(resolveLatestSpeakText(messages)).toBe('latest')
})
