import { expect, test } from 'vitest'

import { selectRecentHistory } from '../src/supervisor/history-select.js'
import type { HistoryMessage } from '../src/types/index.js'

const createMessage = (id: string, createdAt: string): HistoryMessage => ({
  id,
  role: 'user',
  text: id,
  createdAt,
})

test('selectRecentHistory keeps chronological order after selecting from tail', () => {
  const history: HistoryMessage[] = [
    createMessage('m1', '2026-01-01T00:00:00.000Z'),
    createMessage('m2', '2026-01-02T00:00:00.000Z'),
    createMessage('m3', '2026-01-03T00:00:00.000Z'),
  ]
  const selected = selectRecentHistory(history, {
    minCount: 0,
    maxCount: 2,
    maxBytes: 0,
  })
  expect(selected.map((item) => item.id)).toEqual(['m2', 'm3'])
})

test('selectRecentHistory enforces minCount before bytes stop', () => {
  const history: HistoryMessage[] = [
    createMessage('m1', '2026-01-01T00:00:00.000Z'),
    createMessage('m2', '2026-01-02T00:00:00.000Z'),
    createMessage('m3', '2026-01-03T00:00:00.000Z'),
  ]
  const selected = selectRecentHistory(history, {
    minCount: 2,
    maxCount: 10,
    maxBytes: 110,
  })
  expect(selected).toHaveLength(2)
  expect(selected.map((item) => item.id)).toEqual(['m2', 'm3'])
})
