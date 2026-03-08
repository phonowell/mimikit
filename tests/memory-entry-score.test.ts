import { expect, test } from 'vitest'

import { rankMemoryEntries } from '../src/memory/entry-score.js'

test('rankMemoryEntries boosts entries that are repeatedly mentioned', () => {
  const ranked = rankMemoryEntries({
    entries: [
      {
        id: 'memory-alpha',
        title: 'Alpha',
        content: 'alpha preference',
        updatedAt: '2026-03-01T00:00:00.000Z',
        source: 'remember',
      },
      {
        id: 'memory-beta',
        title: 'Beta',
        content: 'beta preference',
        updatedAt: '2026-03-01T00:00:00.000Z',
        source: 'remember',
      },
    ],
    context: {
      queryText: '',
      mentionTexts: ['alpha', 'alpha', 'alpha', 'beta'],
      workingFocusIds: [],
    },
  })

  expect(ranked[0]?.id).toBe('memory-alpha')
  expect((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0)).toBe(true)
})

test('rankMemoryEntries supports CJK overlap for relevance', () => {
  const ranked = rankMemoryEntries({
    entries: [
      {
        id: 'memory-chinese',
        title: '语言偏好',
        content: '后续请始终中文简洁回复',
        updatedAt: '2026-03-01T00:00:00.000Z',
        source: 'remember',
      },
      {
        id: 'memory-english',
        title: 'Tooling',
        content: 'Prefer jest snapshot update mode.',
        updatedAt: '2026-03-01T00:00:00.000Z',
        source: 'remember',
      },
    ],
    context: {
      queryText: '请用中文回复并保持简洁',
      mentionTexts: ['中文简洁', '中文简洁'],
      workingFocusIds: [],
    },
  })

  expect(ranked[0]?.id).toBe('memory-chinese')
})
